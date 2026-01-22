const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const app = express();
const port = process.env.PORT || 3000;

app.get('/getValues', async (req, res) => {
  const ids = req.query.ids ? req.query.ids.split(',') : [];
  if (ids.length === 0) {
    return res.status(400).json({ error: 'Provide ?ids=ID1,ID2,...' });
  }

  const results = {};
  for (const id of ids) {
    try {
      const url = `https://www.rolimons.com/item/${id}`;
      const { data } = await axios.get(url);
      const $ = cheerio.load(data);

      // Parse RAP and Value from page (current 2026 structure: look for .stat-value spans)
      let rap = 0;
      let value = 0;
      $('.stat').each((i, el) => {
        const label = $(el).prev('.stat-label').text().trim().toLowerCase();
        const numStr = $(el).text().trim().replace(/,/g, '');
        if (label.includes('rap')) {
          rap = parseInt(numStr, 10) || 0;
        } else if (label.includes('value')) {
          value = parseInt(numStr, 10) || 0;
        }
      });

      results[id] = { rap, value: value > 0 ? value : rap };
    } catch (error) {
      results[id] = { rap: 0, value: 0, error: error.message };
    }
  }

  res.json(results);
});

app.listen(port, () => {
  console.log(`Rolimons collector running on port ${port}`);
});
