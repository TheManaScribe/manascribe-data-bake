import fs from 'fs';
import { pipeline } from 'stream/promises';
import yauzl from 'yauzl';
import StreamJsonParser from 'stream-json/Parser.js';
import StreamJsonPick from 'stream-json/filters/Pick.js';
import StreamJsonArray from 'stream-json/streamers/StreamArray.js';

const SOURCE_URL = 'https://mtgjson.com/api/v5/AllPrintings.json.zip';
const TEMP_ZIP = 'all-printings.zip';
const OUTPUT_FILE = 'mana-scribe-index.json';

async function bake() {
    console.log('🚀 Starting Robust Streaming Bakery...');

    // 1. Download to temporary file
    const response = await fetch(SOURCE_URL);
    if (!response.ok) throw new Error(`Download failed: ${response.statusText}`);
    await pipeline(response.body, fs.createWriteStream(TEMP_ZIP));
    console.log('📦 Download complete.');

    const outStream = fs.createWriteStream(OUTPUT_FILE);
    outStream.write('['); 
    let first = true;
    let cardCount = 0;

    // 2. Open Zip and Stream JSON
    await new Promise((resolve, reject) => {
        yauzl.open(TEMP_ZIP, { lazyEntries: true }, (err, zipfile) => {
            if (err) return reject(err);
            zipfile.readEntry();
            
            zipfile.on('entry', (entry) => {
                if (!entry.fileName.endsWith('.json')) return zipfile.readEntry();
                
                zipfile.openReadStream(entry, (err, readStream) => {
                    if (err) return reject(err);

                    // Using the suggested default import pattern to avoid SyntaxErrors
                    const jsonStream = readStream
                        .pipe(new StreamJsonParser())
                        .pipe(new StreamJsonPick({ filter: 'data' })) // Start at data level
                        .pipe(new StreamJsonArray()); // Stream through sets/cards

                    jsonStream.on('data', (data) => {
                        // MTGJSON AllPrintings is structured as data: { SET_CODE: { cards: [...] } }
                        const set = data.value;
                        if (!set.cards) return;

                        set.cards.forEach(card => {
                            const simplified = {
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
                            };

                            if (!first) outStream.write(',');
                            outStream.write(JSON.stringify(simplified));
                            first = false;
                            cardCount++;
                        });
                    });

                    jsonStream.on('end', () => {
                        outStream.write(']');
                        outStream.end();
                        resolve();
                    });

                    jsonStream.on('error', (e) => {
                        console.error('Pipeline Error:', e);
                        reject(e);
                    });
                });
            });
        });
    });

    if (fs.existsSync(TEMP_ZIP)) fs.unlinkSync(TEMP_ZIP);
    console.log(`✅ Success! Baked ${cardCount} cards into ${OUTPUT_FILE}`);
}

bake().catch(err => {
    console.error('❌ Bake failed:', err);
    process.exit(1);
});
