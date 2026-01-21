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

async function refreshRolimons(force = false) {
  if (!force && rolimonsCache) return;

  try {
    console.log("Fetching Rolimons...");
    const res = await fetch(ROLIMONS_URL, { timeout: 15000 });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data && data.items) {
      rolimonsCache = data.items;
      console.log(`Rolimons loaded: ${Object.keys(data.items).length} items`);
    } else {
      console.log("Rolimons data invalid");
    }
  } catch (e) {
    console.error("Rolimons fetch failed:", e.message);
    rolimonsCache = null;
  }
}

async function scrapeRobloxPrice(id) {
  console.log(`Scraping catalog for ID ${id}`);
  try {
    const res = await fetch(`https://www.roblox.com/catalog/${id}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://www.roblox.com/',
        'Accept': 'text/html'
      },
      timeout: 15000
    });

    if (!res.ok) {
      console.log(`Roblox catalog ${res.status} for ${id}`);
      return 0;
    }

    const html = await res.text();
    const $ = cheerio.load(html);

    // Your exact class first
    let priceText = $('span.text-robux-lg').first().text().trim();
    if (priceText) {
      console.log(`Found .text-robux-lg: "${priceText}"`);
    }

    // More fallbacks
    if (!priceText) priceText = $('.text-robux, .price-container span, .PricingContainer span, [data-price]').first().text().trim();

    // Regex on body (handles dot/comma)
    if (!priceText) {
      const body = $('body').text();
      const match = body.match(/(\d{1,3}([.,])\d{3})/) || body.match(/Buy for.*?(\d{1,3}([.,])\d{3})/i);
      if (match) priceText = match[1];
    }

    if (priceText) {
      const clean = priceText.replace(/[.,]/g, '').match(/\d+/);
      const price = clean ? Number(clean[0]) : 0;
      if (price > 0) {
        console.log(`Parsed price ${price} from "${priceText}"`);
        return price;
      }
    }

    console.log(`No price detected for ${id}`);
    return 0;
  } catch (e) {
    console.error(`Scrape fail for ${id}: ${e.message}`);
    return 0;
  }
}

// API endpoint
app.get('/get-price/:id', async (req, res) => {
  const id = req.params.id.trim();
  if (!/^\d+$/.test(id)) return res.status(400).json({ success: false, error: 'Invalid ID' });

  await refreshRolimons();

  let price = 0;
  let source = 'none';

  // Rolimons first (limiteds)
  if (rolimonsCache) {
    const item = rolimonsCache[id];
    if (item && Array.isArray(item) && item[3]) {
      price = Number(item[3]) || 0;
      source = 'rolimons_rap';
    }
  }

  // Scrape fallback (non-limited)
  if (price === 0) {
    price = await scrapeRobloxPrice(id);
    source = price > 0 ? 'roblox_scraped' : 'none';
  }

  res.json({ success: true, id: Number(id), price, source });
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
  let source = 'none';

  if (rolimonsCache) {
    const item = rolimonsCache[id];
    if (item && item[3]) {
      price = Number(item[3]);
      source = 'Rolimons RAP';
    }
  }

  if (price === 0) {
    price = await scrapeRobloxPrice(id);
    source = price > 0 ? 'Roblox scraped' : 'Not found';
  }

  msg.reply(`**ID ${id}**\nPrice: **${price.toLocaleString()} R$** (${source})`);
});

// Start
(async () => {
  await refreshRolimons(true); // force initial load
  client.login(process.env.DISCORD_TOKEN).catch(e => console.error('Login fail:', e));
  app.listen(process.env.PORT || 3000, () => console.log('Ready'));
})();
