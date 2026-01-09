import fs from 'fs';
import { pipeline } from 'stream/promises';
import yauzl from 'yauzl';
import { chain } from 'stream-json';
import { parser } from 'stream-json/Parser.js';
import { pick } from 'stream-json/filters/Pick.js';
import { streamArray } from 'stream-json/streamers/StreamArray.js';

const SOURCE_URL = 'https://mtgjson.com/api/v5/AllPrintings.json.zip';
const OUTPUT_FILE = 'mana-scribe-index.json';
const TEMP_ZIP = 'all-printings.zip';

async function bake() {
    console.log('🚀 Starting Streaming Bakery...');

    // 1. Download to temporary file (safest for huge files)
    const response = await fetch(SOURCE_URL);
    const fileStream = fs.createWriteStream(TEMP_ZIP);
    await pipeline(response.body, fileStream);
    console.log('📦 Download complete.');

    // 2. Open Zip and Stream JSON
    const flattenedCards = [];
    
    await new Promise((resolve, reject) => {
        yauzl.open(TEMP_ZIP, { lazyEntries: true }, (err, zipfile) => {
            if (err) return reject(err);
            zipfile.readEntry();
            zipfile.on('entry', (entry) => {
                if (!entry.fileName.endsWith('.json')) return zipfile.readEntry();
                
                zipfile.openReadStream(entry, (err, readStream) => {
                    if (err) return reject(err);

                    // This chain picks specific parts of the JSON without loading the whole thing
                    const pipeline = chain([
                        readStream,
                        parser(),
                        pick({ filter: /data\..*\.cards/ }), // Grabs cards from every set
                        streamArray()
                    ]);

                    pipeline.on('data', (data) => {
                        const card = data.value;
                        // Map only what the app needs
                        flattenedCards.push({
                            id: card.uuid,
                            name: card.name,
                            mana_cost: card.manaCost || "",
                            cmc: card.manaValue || 0,
                            type_line: card.type,
                            supertypes: card.supertypes || [],
                            types: card.types || [],
                            subtypes: card.subtypes || [],
                            set: card.setCode?.toLowerCase(),
                            collector_number: card.number,
                            rarity: card.rarity,
                            scryfallId: card.identifiers?.scryfallId,
                            finishes: card.finishes || []
                        });
                    });

                    pipeline.on('end', () => resolve());
                    pipeline.on('error', reject);
                });
            });
        });
    });

    // 3. Save Final Result
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(flattenedCards));
    fs.unlinkSync(TEMP_ZIP); // Clean up
    console.log(`✅ Success! Created ${OUTPUT_FILE} with ${flattenedCards.length} cards.`);
}

bake().catch(err => {
    console.error('❌ Bake failed:', err);
    process.exit(1);
});
