const cheerio = require("cheerio");
const puppeteerExtra = require("puppeteer-extra");
const stealthPlugin = require("puppeteer-extra-plugin-stealth");
const { createWriteStream } = require("fs");
const { resolve } = require('path');

puppeteerExtra.use(stealthPlugin());

// Define the function to scrape data for a single query
async function scrapeData(query) {
    try {
        const start = Date.now();
        const browser = await puppeteerExtra.launch({
            headless: true,
            executablePath: "", // your path here
        });
        const page = await browser.newPage();

        await page.goto(`https://www.google.com/maps/search/${query.split(" ").join("+")}`);

        // Auto-scroll function
        async function autoScroll(page) {
            await page.evaluate(async () => {
                const wrapper = document.querySelector('div[role="feed"]');
                await new Promise((resolve, reject) => {
                    var totalHeight = 0;
                    var distance = 1000;
                    var scrollDelay = 3000;
                    var timer = setInterval(async () => {
                        var scrollHeightBefore = wrapper.scrollHeight;
                        wrapper.scrollBy(0, distance);
                        totalHeight += distance;
                        if (totalHeight >= scrollHeightBefore) {
                            totalHeight = 0;
                            await new Promise((resolve) => setTimeout(resolve, scrollDelay));
                            var scrollHeightAfter = wrapper.scrollHeight;
                            if (scrollHeightAfter > scrollHeightBefore) {
                                return;
                            } else {
                                clearInterval(timer);
                                resolve();
                            }
                        }
                    }, 200);
                });
            });
        }

        await autoScroll(page);

        const html = await page.content();
        const $ = cheerio.load(html);
        const aTags = $("a");
        const businesses = [];
        aTags.each((i, el) => {
            const href = $(el).attr("href");
            if (href && href.includes("/maps/place/")) {
                const parent = $(el).parent();
                const url = href;
                const storeName = parent.find("div.fontHeadlineSmall").text();
                const ratingText = parent.find("span.fontBodyMedium > span").attr("aria-label");
                businesses.push({ url, storeName, ratingText });
            }
        });

        // Scraping business details and writing to CSV
        const fileName = `${query.split(" ").join("_")}.csv`;
        const filePath = resolve(process.cwd(), fileName); // Save in the current directory
        const stream = createWriteStream(filePath);
        stream.write('Place ID,Phone,Address,Google URL,Business Website,Store Name,Rating Text,Stars,Number of Reviews,Email\n');

        for (const business of businesses) {
            try {
                await page.goto(business.url, { timeout: 10000 });
                const businessHtml = await page.content();
                const business$ = cheerio.load(businessHtml);

                // Corrected selectors for phone and address based on the provided HTML structures
                const phoneSelector = "button[aria-label^='Phone:']";
                const addressSelector = "button[aria-label^='Address:']";

                // Extracting phone number and address
                const phoneAriaLabel = business$(phoneSelector).attr('aria-label');
                const addressAriaLabel = business$(addressSelector).attr('aria-label');

                const phone = phoneAriaLabel ? phoneAriaLabel.replace('Phone: ', '').trim() : '';
                const address = addressAriaLabel ? addressAriaLabel.replace('Address: ', '').trim() : '';

                // Extracting website remains unchanged
                const websiteSelector = ".etWJQ.kdfrQc a";
                let website = business$(websiteSelector).attr('href') || '';

                if (website.startsWith("tel:")) {
                    website = ''; // If it's a telephone link, set website to empty string
                }

                const businessData = {
                    placeId: business.url.split("?")[0].split("ChI")[1],
                    phone,
                    address,
                    googleUrl: business.url,
                    bizWebsite: website,
                    storeName: business.storeName,
                    ratingText: business.ratingText,
                    stars: business.ratingText?.split("stars")?.[0]?.trim() ? Number(business.ratingText?.split("stars")?.[0]?.trim()) : null,
                    numberOfReviews: business.ratingText?.split("stars")?.[1]?.replace("Reviews", "")?.trim() ? Number(business.ratingText?.split("stars")?.[1]?.replace("Reviews", "")?.trim()) : null,
                    email: "" // Leaving email blank since we are not scraping emails anymore
                };

                const row = `${businessData.placeId},"${escapeDoubleQuotes(businessData.phone)}","${escapeDoubleQuotes(businessData.address)}","${escapeDoubleQuotes(businessData.googleUrl)}","${escapeDoubleQuotes(businessData.bizWebsite)}","${escapeDoubleQuotes(businessData.storeName)}","${escapeDoubleQuotes(businessData.ratingText)}",${businessData.stars},${businessData.numberOfReviews},"${escapeDoubleQuotes(businessData.email)}"\n`;
                stream.write(row);
            } catch (error) {
                console.error(`Error scraping data for URL "${business.url}": ${error}`);
            }
        }

        stream.end();
        console.log(`Scraping complete for query: ${query}`);
        const end = Date.now();
        console.log(`Time in seconds: ${Math.floor((end - start) / 1000)}`);
        return businesses;
    } catch (error) {
        console.error(`Error scraping data for query "${query}": ${error}`);
    }
}

// Function to escape double quotes in CSV values
function escapeDoubleQuotes(str) {
    return str.replace(/"/g, '""');
}

const queries = [
    { query: "propane companies", location: "arlington washington" },
    { query: "propane companies", location: "dupont washington" },

    // Add more queries as needed
];

async function scrapeQueries(queries) {
    for (const { query, location } of queries) {
        const searchQuery = `${query} in ${location}`;
        console.log(`Scraping data for: ${searchQuery}`);
        await scrapeData(searchQuery); // Now it's clear that scrapeData expects a combined search term
    }
}

module.exports = { scrapeQueries };

// Replace or adjust this with your actual queries
scrapeQueries(queries).then(() => {
    console.log("Finished all scraping tasks.");
}).catch(console.error);
