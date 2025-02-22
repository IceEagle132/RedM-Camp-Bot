const { Client, GatewayIntentBits, EmbedBuilder, PermissionsBitField } = require('discord.js');
const fs = require('fs');
const config = require('./config.json');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

let existingMaterialsEmbedMessage = null;
let existingInventoryEmbedMessage = null;

const MATERIALS_DATA_FILE = './data.json';
const INVENTORY_DATA_FILE = './inventoryData.json';

let userData = {};
if (fs.existsSync(MATERIALS_DATA_FILE)) {
  try {
    userData = JSON.parse(fs.readFileSync(MATERIALS_DATA_FILE, 'utf8'));
  } catch (error) {
    console.error('Error reading materials data file:', error);
  }
} else {
  fs.writeFileSync(MATERIALS_DATA_FILE, JSON.stringify(userData, null, 2));
}

function saveMaterialsData() {
  for (const userId in userData) {
    userData[userId].materials = parseFloat(userData[userId].materials.toFixed(2));
  }
  fs.writeFileSync(MATERIALS_DATA_FILE, JSON.stringify(userData, null, 2));
}

let inventoryData = {};
if (fs.existsSync(INVENTORY_DATA_FILE)) {
  try {
    inventoryData = JSON.parse(fs.readFileSync(INVENTORY_DATA_FILE, 'utf8'));
  } catch (error) {
    console.error('Error reading inventory data file:', error);
  }
} else {
  fs.writeFileSync(INVENTORY_DATA_FILE, JSON.stringify(inventoryData, null, 2));
}

function saveInventoryData() {
  fs.writeFileSync(INVENTORY_DATA_FILE, JSON.stringify(inventoryData, null, 2));
}

function generateMaterialsEmbed(data) {
  let totalMaterials = 0;
  for (const userId in data) {
    totalMaterials += data[userId].materials;
  }
  const embed = new EmbedBuilder()
    .setTitle('📊 Materials Tracking')
    .setDescription('ACG Camp')
    .setColor(config.EMBED_COLOR)
    .setTimestamp()
    .setFooter({ text: `📦 Total Materials: ${totalMaterials.toFixed(2)}` });

  const fields = [];
  for (const userId in data) {
    const { materials, lastKnownName } = data[userId];
    const displayName = lastKnownName || userId;
    fields.push({
      name: displayName,
      value: `🦌 Materials: **${materials.toFixed(2)}**`,
      inline: true
    });
  }
  if (fields.length > 0) embed.addFields(fields);
  return embed;
}

function generateInventoryEmbed(data) {
  const lines = [];
  let totalItems = 0;
  for (const itemName in data) {
    const qty = data[itemName];
    lines.push(`• ${itemName} (x${qty})`);
    totalItems += qty;
  }
  const embed = new EmbedBuilder()
    .setTitle('📦 Camp Inventory')
    .setColor('#FFA500')
    .setTimestamp()
    .setFooter({ text: `Total items: ${totalItems}` });
  if (lines.length === 0) {
    embed.setDescription('No items in the inventory yet.');
  } else {
    embed.setDescription(lines.join('\n'));
  }
  return embed;
}

client.once('ready', async () => {
  try {
    const materialsChannel = await client.channels.fetch(config.TARGET_CHANNEL_ID);
    const matMessages = await materialsChannel.messages.fetch({ limit: 50 });
    existingMaterialsEmbedMessage = matMessages.find(
      m => m.author.id === client.user.id && m.embeds.length > 0
    );
    if (existingMaterialsEmbedMessage) {
      const embed = generateMaterialsEmbed(userData);
      await existingMaterialsEmbedMessage.edit({ embeds: [embed] });
    }

    const inventoryChannel = await client.channels.fetch(config.INVENTORY_CHANNEL_ID);
    const invMessages = await inventoryChannel.messages.fetch({ limit: 50 });
    existingInventoryEmbedMessage = invMessages.find(
      m => m.author.id === client.user.id && m.embeds.length > 0
    );
    if (existingInventoryEmbedMessage) {
      const embed = generateInventoryEmbed(inventoryData);
      await existingInventoryEmbedMessage.edit({ embeds: [embed] });
    }
  } catch (error) {
    console.error('Startup error:', error);
  }
  console.log(`Logged in as ${client.user.tag}`);
});

client.on('messageCreate', async message => {
  if (message.content.trim() === '!mclear') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return;
    }
    userData = {};
    fs.writeFileSync(MATERIALS_DATA_FILE, JSON.stringify(userData, null, 2));
    const newEmbed = generateMaterialsEmbed(userData);
    try {
      const materialsChannel = await client.channels.fetch(config.TARGET_CHANNEL_ID);
      if (existingMaterialsEmbedMessage) {
        await existingMaterialsEmbedMessage.edit({ embeds: [newEmbed] });
      } else {
        existingMaterialsEmbedMessage = await materialsChannel.send({ embeds: [newEmbed] });
      }
      await message.channel.send('All materials data cleared!');
    } catch (error) {
      console.error('Error clearing materials:', error);
    }
    return;
  }

  if (message.content.trim() === '!materials') {
    const embed = generateMaterialsEmbed(userData);
    await message.channel.send({ embeds: [embed] });
    return;
  }

  if (message.content.trim() === '!invclear') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return;
    }
    inventoryData = {};
    saveInventoryData();
    const newEmbed = generateInventoryEmbed(inventoryData);
    try {
      const inventoryChannel = await client.channels.fetch(config.INVENTORY_CHANNEL_ID);
      if (existingInventoryEmbedMessage) {
        await existingInventoryEmbedMessage.edit({ embeds: [newEmbed] });
      } else {
        existingInventoryEmbedMessage = await inventoryChannel.send({ embeds: [newEmbed] });
      }
      await message.channel.send('All inventory data cleared!');
    } catch (error) {
      console.error('Error clearing inventory:', error);
    }
    return;
  }

  if (message.content.trim() === '!inventory') {
    const embed = generateInventoryEmbed(inventoryData);
    await message.channel.send({ embeds: [embed] });
    return;
  }

  if (message.webhookId && message.channel.id === config.WEBHOOK_CHANNEL_ID) {
    let content = message.content || '';
    if (!content && message.embeds.length > 0) {
      const embed = message.embeds[0];
      if (embed.description) content += embed.description;
      if (embed.title) content += `\n${embed.title}`;
      if (Array.isArray(embed.fields)) {
        embed.fields.forEach(f => {
          content += `\n${f.name}\n${f.value}`;
        });
      }
    }
    content = content.replace(/\r?\n/g, ' ');

    const depositMatch = content.match(/Deposited item:\s+(.+?)\s+(\d+)\s+ID:\s+\d+/i);
    const withdrawMatch = content.match(/Withdraw item:\s+(.+?)\s+(\d+)\s+ID:\s+\d+/i);
    let itemName, qty = 0, isDeposit = false, isWithdraw = false;

    if (depositMatch) {
      itemName = depositMatch[1];
      qty = parseInt(depositMatch[2]);
      isDeposit = true;
    } else if (withdrawMatch) {
      itemName = withdrawMatch[1];
      qty = parseInt(withdrawMatch[2]);
      isWithdraw = true;
    }

    if (itemName && (isDeposit || isWithdraw)) {
      if (!inventoryData[itemName]) inventoryData[itemName] = 0;
      if (isDeposit) {
        inventoryData[itemName] += qty;
      } else {
        inventoryData[itemName] -= qty;
        if (inventoryData[itemName] <= 0) {
          delete inventoryData[itemName];
        }
      }
      saveInventoryData();
      const newInvEmbed = generateInventoryEmbed(inventoryData);
      try {
        const inventoryChannel = await client.channels.fetch(config.INVENTORY_CHANNEL_ID);
        if (existingInventoryEmbedMessage) {
          await existingInventoryEmbedMessage.edit({ embeds: [newInvEmbed] });
        } else {
          existingInventoryEmbedMessage = await inventoryChannel.send({ embeds: [newInvEmbed] });
        }
      } catch (err) {
        console.error('Error updating inventory embed:', err);
      }
    }

    const materialsMatch = content.match(/Materials added:\s+([\d.]+)/);
    const peltMatch = content.match(/worth\s+([\d.]+)/);
    const mentionRegex = /<@!?(\d+)>/;
    const mentionMatch = content.match(mentionRegex);
    let userId = mentionMatch ? mentionMatch[1] : null;
    let materialsToAdd = 0;
    if (materialsMatch) {
      materialsToAdd = parseFloat(materialsMatch[1]);
    } else if (peltMatch) {
      materialsToAdd = parseFloat(peltMatch[1]);
    }

    if (materialsToAdd > 0 && userId) {
      let displayName = `User ${userId}`;
      try {
        const member = await message.guild.members.fetch(userId);
        if (member) {
          displayName = member.nickname || member.user.username;
        }
      } catch (error) {
        console.error(`Error fetching Discord member for user ${userId}:`, error);
      }

      if (!userData[userId]) {
        userData[userId] = {
          materials: 0,
          lastKnownName: displayName
        };
      }
      userData[userId].materials += materialsToAdd;
      userData[userId].lastKnownName = displayName;
      saveMaterialsData();

      const newMatEmbed = generateMaterialsEmbed(userData);
      try {
        const materialsChannel = await client.channels.fetch(config.TARGET_CHANNEL_ID);
        if (existingMaterialsEmbedMessage) {
          await existingMaterialsEmbedMessage.edit({ embeds: [newMatEmbed] });
        } else {
          existingMaterialsEmbedMessage = await materialsChannel.send({ embeds: [newMatEmbed] });
        }
      } catch (error) {
        console.error('Error updating materials embed:', error);
      }
    }
  }
});

client.login(config.BOT_TOKEN);
