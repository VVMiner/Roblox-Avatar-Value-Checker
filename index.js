const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');

const app = express();
const port = process.env.PORT || 3000;

// Add headers to mimic browser (helps avoid blocks)
const headers = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
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

      let rap = 0;
      let value = 0;

      // Search for elements containing "RAP" or "Value" and grab nearby numbers
      $('body *').each((i, el) => {
        const text = $(el).text().trim().toLowerCase();
        if (text.includes('rap') && !text.includes('after sale')) {  // Avoid "RAP After Sale"
          // Look for sibling or child number (often in .stat or just text)
          const numMatch = $(el).nextAll().addBack().text().match(/[\d,]+/);
          if (numMatch) rap = parseInt(numMatch[0].replace(/,/g, ''), 10) || 0;
        }
        if (text.includes('value') && !text.includes('demand')) {
          const numMatch = $(el).nextAll().addBack().text().match(/[\d,]+/);
          if (numMatch) value = parseInt(numMatch[0].replace(/,/g, ''), 10) || 0;
        }
      });

      // Alternative: target common stat containers
      if (rap === 0) {
        $('.stat:contains("RAP")').each((i, el) => {
          const num = $(el).text().trim().replace(/[^0-9]/g, '');
          if (num) rap = parseInt(num, 10);
        });
      }
      if (value === 0) {
        $('.stat:contains("Value")').each((i, el) => {
          const num = $(el).text().trim().replace(/[^0-9]/g, '');
          if (num) value = parseInt(num, 10);
        });
      }

      results[id] = {
        rap,
        value: value > 0 ? value : rap,  // Fallback to RAP if value missing
        rawTextSample: $('body').text().substring(0, 200)  // Debug snippet (remove later)
      };
    } catch (error) {
      results[id] = { rap: 0, value: 0, error: error.message };
    }
  }

  res.json(results);
});

app.listen(port, () => {
  console.log(`Rolimons collector on port ${port}`);
});
