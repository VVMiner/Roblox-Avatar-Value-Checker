const express = require('express');
const { Client, GatewayIntentBits } = require('discord.js');
const fetch = require('node-fetch');

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

// Roblox official price fallback
async function getRobloxPrice(id) {
  try {
    const res = await fetch(`https://economy.roblox.com/v1/assets/${id}/resellers`); // sometimes works
    if (res.ok) {
      const data = await res.json();
      if (data.data && data.data.length > 0) {
        return data.data[0].price; // lowest resale price
      }
    }
  } catch {}

  // Main fallback: GetProductInfo via Roblox API proxy (works 99% of time for on-sale items)
  try {
    const res = await fetch(`https://api.roblox.com/marketplace/productinfo?assetId=${id}`);
    if (res.ok) {
      const data = await res.json();
      return data.PriceInRobux || 0;
    }
  } catch {}

  return 0;
}

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

// Web endpoint (Roblox script uses this)
app.get('/get-price/:id', async (req, res) => {
  const id = req.params.id.trim();
  if (!/^\d+$/.test(id)) return res.status(400).json({ success: false, error: 'Invalid ID' });

  await refreshRolimons();

  let price = 0;
  let source = 'none';

  // 1. Rolimons RAP (limiteds)
  const rolimonsItem = rolimonsCache?.[id];
  if (rolimonsItem && Array.isArray(rolimonsItem) && rolimonsItem.length >= 4) {
    price = Number(rolimonsItem[3]) || 0;
    source = 'rolimons_rap';
  } else {
    // 2. Roblox official price (normal on-sale UGC)
    price = await getRobloxPrice(id);
    if (price > 0) source = 'roblox_official';
  }

  res.json({
    success: true,
    id: Number(id),
    price,
    source
  });
});

// Discord command (optional)
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
    price = await getRobloxPrice(id);
    source = price > 0 ? 'Roblox catalog price' : 'Free / Off-sale / Not tracked';
  }

  msg.reply(`**ID ${id}**\nPrice: **${price.toLocaleString()} R$** (${source})`);
});

// Start
(async () => {
  await refreshRolimons();
  client.login(process.env.DISCORD_TOKEN);
  app.listen(process.env.PORT || 3000, () => console.log('API ready'));
})();
