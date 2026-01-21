const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const axios = require('axios');
require('dotenv').config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// Command prefix
const PREFIX = '!';

client.once('ready', () => {
    console.log(`✅ Bot is online as ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
    if (!message.content.startsWith(PREFIX) || message.author.bot) return;

    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    if (command === 'search') {
        if (!args.length) {
            return message.reply('❌ Please provide an item name to search! Example: `!search Dominus`');
        }

        const searchTerm = args.join(' ');
        await searchCatalog(message, searchTerm);
    }

    if (command === 'item') {
        if (!args.length) {
            return message.reply('❌ Please provide an item ID! Example: `!item 48474243`');
        }

        const itemId = args[0];
        await getItemDetails(message, itemId);
    }

    if (command === 'help') {
        const helpEmbed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle('📖 Roblox Catalog Bot Commands')
            .addFields(
                { name: '!search <item name>', value: 'Search for items in Roblox catalog' },
                { name: '!item <item ID>', value: 'Get detailed info about a specific item' },
                { name: '!help', value: 'Show this help message' }
            )
            .setTimestamp();

        message.channel.send({ embeds: [helpEmbed] });
    }
});

async function searchCatalog(message, query) {
    try {
        await message.channel.send(`🔍 Searching for "${query}"...`);

        // Using Roblox's catalog search API
        const response = await axios.get('https://catalog.roblox.com/v1/search/items', {
            params: {
                keyword: query,
                limit: 10,
                category: 'All',
                sortType: 0
            }
        });

        const items = response.data.data;

        if (!items || items.length === 0) {
            return message.channel.send('❌ No items found for that search term.');
        }

        // Create embed with search results
        const embed = new EmbedBuilder()
            .setColor(0x00AE86)
            .setTitle(`🔍 Search Results: "${query}"`)
            .setDescription(`Found ${items.length} items`)
            .setTimestamp();

        // Add up to 10 items to embed
        items.slice(0, 10).forEach((item, index) => {
            const price = item.price || 'Not for sale';
            const limited = item.limited ? '✅' : '❌';
            
            embed.addFields({
                name: `${index + 1}. ${item.name}`,
                value: `**ID:** ${item.id}\n**Price:** R$${price}\n**Limited:** ${limited}\n**Type:** ${item.itemType || 'Unknown'}`,
                inline: false
            });
        });

        message.channel.send({ embeds: [embed] });

    } catch (error) {
        console.error('Search error:', error);
        message.channel.send('❌ Failed to search catalog. Please try again later.');
    }
}

async function getItemDetails(message, itemId) {
    try {
        await message.channel.send(`📊 Fetching item details for ID: ${itemId}...`);

        // Get item details from multiple APIs
        const [catalogRes, economyRes] = await Promise.all([
            axios.get(`https://catalog.roblox.com/v1/catalog/items/${itemId}/details`),
            axios.get(`https://economy.roblox.com/v2/assets/${itemId}/details`)
        ]);

        const item = catalogRes.data;
        const economyInfo = economyRes.data;

        // Create detailed embed
        const embed = new EmbedBuilder()
            .setColor(0xFF4500)
            .setTitle(item.name || 'Unknown Item')
            .setURL(`https://www.roblox.com/catalog/${itemId}/`)
            .setDescription(item.description || 'No description available')
            .addFields(
                { name: '🆔 Item ID', value: itemId, inline: true },
                { name: '💰 Price', value: `${item.price || 'Not for sale'} Robux`, inline: true },
                { name: '📦 Type', value: item.itemType || 'Unknown', inline: true },
                { name: '🎨 Creator', value: item.creatorName || 'Unknown', inline: true },
                { name: '🏷️ Asset Type', value: economyInfo.AssetType || 'Unknown', inline: true },
                { name: '🏷️ Genre', value: economyInfo.Genre || 'Not specified', inline: true }
            )
            .setTimestamp();

        // Add item image if available
        if (item.thumbnailUrl) {
            embed.setThumbnail(item.thumbnailUrl);
        }

        // Add sales info if available
        if (economyInfo.Sales) {
            embed.addFields({ 
                name: '📈 Total Sales', 
                value: economyInfo.Sales.toLocaleString(), 
                inline: true 
            });
        }

        message.channel.send({ embeds: [embed] });

    } catch (error) {
        console.error('Item details error:', error);
        message.channel.send('❌ Failed to fetch item details. Make sure the item ID is correct.');
    }
}

// Login to Discord
client.login(process.env.DISCORD_TOKEN);
