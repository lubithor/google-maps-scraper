const express = require('express');
const bodyParser = require('body-parser');
const { scrapeQueries } = require('./google-maps-bot.cjs'); // Ensure this path is correct
const app = express();
const port = 3000;

// Middleware to parse URL-encoded bodies
app.use(bodyParser.urlencoded({ extended: true }));

// Serve static files from 'public' directory
app.use(express.static('public'));

// Handle form submission
app.post('/search', async (req, res) => {
    const { city, query } = req.body; // These could now be arrays
    const searchQueries = query.map((q, index) => ({ query: q, location: city[index] }));

    try {
        await scrapeQueries(searchQueries);
        res.send("Scraping Complete. Please check the output directory for the CSV file.");
    } catch (error) {
        console.error("Error during scraping:", error);
        res.status(500).send("An error occurred during scraping.");
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
