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
      console.log(`Rolimons cached: ${Object.keys(data.items).length} items`);
    }
  } catch (e) {
    console.error("Rolimons failed:", e.message);
  }
}

// Scrape Roblox catalog for price (fallback)
async function scrapeRobloxPrice(id) {
  try {
    const res = await fetch(`https://www.roblox.com/catalog/${id}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });
    if (!res.ok) throw new Error(`Roblox page ${res.status}`);
    const html = await res.text();
    const $ = cheerio.load(html);

    // Try multiple selectors
    let priceText = $('.price-container .text-robux').first().text().trim() ||
                    $('.PricingContainer .PriceNumber').first().text().trim() ||
                    $('div[data-price]').attr('data-price') ||
                    $('span:contains("Robux")').first().text().trim() ||
                    $('div:contains("Buy for")').text().trim();

    if (!priceText) {
      // Regex fallback on body text
      const bodyText = $('body').text();
      const match = bodyText.match(/Buy for\s*(\d{1,3}(?:,\d{3})*)\s*(Robux|R\$)/i) ||
                     bodyText.match(/R\$\s*(\d{1,3}(?:,\d{3})*)/i) ||
                     bodyText.match(/(\d{1,3}(?:,\d{3})*)\s*Robux/i);
      priceText = match ? match[1] : '';
    }

    if (priceText) {
      const clean = priceText.replace(/,/g, '').match(/\d+/);
      const price = clean ? Number(clean[0]) : 0;
      if (price > 0) return price;
    }

    // Check for free/offsale keywords
    if (/free|off sale|limited|not for sale/i.test($('body').text())) {
      return 0;
    }

    return 0;
  } catch (e) {
    console.error(`Scrape failed for ${id}:`, e.message);
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

// Health + Discord commands (keep as before)
app.get('/health', (req, res) => res.json({ status: 'ok' }));

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
    source = price > 0 ? 'Roblox catalog scraped' : 'Free / Off-sale / Not tracked';
  }

  msg.reply(`**ID ${id}**\nPrice: **${price.toLocaleString()} R$** (${source})`);
});

// Start
(async () => {
  await refreshRolimons();
  client.login(process.env.DISCORD_TOKEN);
  app.listen(process.env.PORT || 3000, () => console.log('Bot + API ready'));
})();
