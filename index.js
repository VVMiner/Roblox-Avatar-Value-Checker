const express = require('express');
const { Client, GatewayIntentBits } = require('discord.js');
const fetch = require('node-fetch');
const cheerio = require('cheerio');

const app = express();
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const ROLIMONS_URL = "https://www.rolimons.com/itemapi/itemdetails";
let rolimonsCache = null;
let lastCache = 0;

async function refreshRolimons() {
  const now = Date.now();
  if (rolimonsCache && now - lastCache < 300000) return;

  try {
    const res = await fetch(ROLIMONS_URL);
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    if (data.items) {
      rolimonsCache = data.items;
      lastCache = now;
      console.log(`Rolimons cache updated (${Object.keys(data.items).length} items)`);
    }
  } catch (e) {
    console.error("Rolimons failed:", e.message);
  }
}

async function scrapeRobloxPrice(id) {
  try {
    const res = await fetch(`https://www.roblox.com/catalog/${id}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://www.roblox.com/'
      },
      timeout: 12000
    });

    if (!res.ok) {
      console.log(`Roblox page ${res.status} for ID ${id}`);
      return 0;
    }

    const html = await res.text();
    const $ = cheerio.load(html);

    // Priority selectors
    const selectors = [
      '.text-robux-lg',                     // Your exact class
      '.text-robux',
      '.price-container .text-robux',
      '.PricingContainer .PriceNumber',
      '[data-price]',
      '.amount',
      'span.font-header-1',
      '.PriceDetails span'
    ];

    let priceText = '';
    for (const sel of selectors) {
      priceText = $(sel).first().text().trim();
      if (priceText) {
        console.log(`Matched selector '${sel}' → "${priceText}"`);
        break;
      }
    }

    // Regex fallback (handles dot/comma separators)
    if (!priceText) {
      const bodyText = $('body').text();
      const match = bodyText.match(/(\d{1,3}([.,])\d{3}*)/) ||  // 50.000 or 50,000
                    bodyText.match(/Buy for\s*(\d{1,3}([.,])\d{3}*)\s*(Robux|R\$)/i) ||
                    bodyText.match(/R\$\s*(\d{1,3}([.,])\d{3}*)/i);
      if (match) {
        priceText = match[1];
        console.log(`Regex matched: "${priceText}"`);
      }
    }

    // Parse and clean (remove dot/comma separators)
    if (priceText) {
      const clean = priceText.replace(/[.,]/g, '');
      const price = Number(clean) or 0;
      if (price > 0) {
        console.log(`Parsed price ${price} from "${priceText}" for ${id}`);
        return price;
      }
    }

    // Check for free/offsale/limited
    const bodyLower = $('body').text().toLowerCase();
    if (/free|off sale|limited|not for sale/i.test(bodyLower)) {
      console.log(`Item ${id} detected as free/offsale/limited`);
      return 0;
    }

    // Debug snippet if failed
    const snippet = $('body').text().substring(0, 500).replace(/\s+/g, ' ');
    console.log(`No price for ${id}. Snippet: "${snippet}"...`);

    return 0;
  } catch (e) {
    console.error(`Scrape error for ${id}: ${e.message}`);
    return 0;
  }
}

// Web endpoint
app.get('/get-price/:id', async (req, res) => {
  const id = req.params.id.trim();
  if (!/^\d+$/.test(id)) return res.status(400).json({ success: false, error: 'Invalid ID' });

  await refreshRolimons();

  let price = 0;
  let source = 'none';

  // Rolimons RAP for limiteds
  const rolimonsItem = rolimonsCache?.[id];
  if (rolimonsItem && Array.isArray(rolimonsItem) && rolimonsItem.length >= 4) {
    price = Number(rolimonsItem[3]) || 0;
    source = 'rolimons_rap';
  } else {
    price = await scrapeRobloxPrice(id);
    source = price > 0 ? 'roblox_scraped' : 'none';
  }

  res.json({
    success: true,
    id: Number(id),
    price,
    source
  });
});

// Health
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Discord command
client.on('messageCreate', async msg => {
  if (msg.author.bot || !msg.content.startsWith('!item')) return;
  const id = msg.content.split(' ')[1];
  if (!id) return msg.reply('Usage: !item <id>');

  await refreshRolimons();
  let price = 0;
  let source = '';

  const item = rolimonsCache?.[id];
  if (item && item[3]) {
    price = Number(item[3]);
    source = 'Rolimons RAP';
  } else {
    price = await scrapeRobloxPrice(id);
    source = price > 0 ? 'Roblox scraped' : 'Free / Off-sale / Not tracked';
  }

  msg.reply(`**ID ${id}**\nPrice: **${price.toLocaleString()} R$** (${source})`);
});

// Start
(async () => {
  await refreshRolimons();
  client.login(process.env.DISCORD_TOKEN)
    .then(() => console.log(`Bot logged in as ${client.user.tag}`))
    .catch(err => console.error('Discord login failed:', err));

  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`API listening on port ${PORT}`));
})();
