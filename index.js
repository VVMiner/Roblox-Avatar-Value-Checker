const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');

const app = express();
const port = process.env.PORT || 3000;

const headers = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5'
};

app.get('/getValues', async (req, res) => {
  const ids = req.query.ids ? req.query.ids.split(',').map(id => id.trim()) : [];
  if (ids.length === 0) {
    return res.status(400).json({ error: 'Provide ?ids=ID1,ID2,...' });
  }

  const results = {};

  for (const id of ids) {
    try {
      const url = `https://www.rolimons.com/item/${id}`;
      const { data } = await axios.get(url, { headers });
      const $ = cheerio.load(data);

      let name = '';
      let rap = 0;
      let value = 0;

      // Parse name from <h1> or title fallback
      name = $('h1').first().text().trim() || $('title').text().trim().split(' - ')[0] || 'Unknown Item';

      // Parse stats using class-based selectors (updated for Rolimons structure)
      $('.stat-label').each((i, el) => {
        const label = $(el).text().trim().toLowerCase();
        const valueStr = $(el).next('.stat-value').text().trim().replace(/,/g, '');
        if (label.includes('rap')) {
          rap = parseInt(valueStr, 10) || 0;
        }
        if (label.includes('value')) {
          value = parseInt(valueStr, 10) || 0;
        }
      });

      // Fallback broad search if class selectors miss
      if (rap === 0 || value === 0) {
        $('span, p, div').each((i, el) => {
          const text = $(el).text().trim().toLowerCase();
          const nextText = $(el).next().text().trim().replace(/,/g, '');
          if (text === 'rap' && nextText) rap = parseInt(nextText, 10) || 0;
          if (text === 'value' && nextText) value = parseInt(nextText, 10) || 0;
        });
      }

      results[id] = {
        name,
        rap,
        value: value > 0 ? value : rap,
        debugNote: rap > 0 || value > 0 ? 'Parsed successfully' : 'No match found - check HTML'
      };
    } catch (error) {
      results[id] = { name: 'Unknown', rap: 0, value: 0, error: error.message };
    }
  }

  res.json(results);
});

app.listen(port, () => {
  console.log(`Rolimons proxy running on port ${port}`);
});
