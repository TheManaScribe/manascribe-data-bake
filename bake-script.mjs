import fs from 'fs';
import { pipeline } from 'stream/promises';
import yauzl from 'yauzl';
import { parser } from 'stream-json/Parser.js';
import { pick } from 'stream-json/filters/Pick.js';
import { streamArray } from 'stream-json/streamers/StreamArray.js';
import { Batch } from 'stream-json/utils/Batch.js';

const SOURCE_URL = 'https://mtgjson.com/api/v5/AllPrintings.json.zip';
const TEMP_ZIP = 'all-printings.zip';
const OUTPUT_FILE = 'mana-scribe-index.json';

async function bake() {
    console.log('🚀 Starting Bulletproof Bakery...');

    // 1. Download to temporary file
    const response = await fetch(SOURCE_URL);
    if (!response.ok) throw new Error(`Download failed: ${response.statusText}`);
    await pipeline(response.body, fs.createWriteStream(TEMP_ZIP));
    console.log('📦 Download complete.');

    const outStream = fs.createWriteStream(OUTPUT_FILE);
    outStream.write('['); // Start JSON array
    let first = true;

    // 2. Open Zip and Stream JSON
    await new Promise((resolve, reject) => {
        yauzl.open(TEMP_ZIP, { lazyEntries: true }, (err, zipfile) => {
            if (err) return reject(err);
            zipfile.readEntry();
            zipfile.on('entry', (entry) => {
                if (!entry.fileName.endsWith('.json')) return zipfile.readEntry();
                
                zipfile.openReadStream(entry, (err, readStream) => {
                    if (err) return reject(err);

                    const jsonStream = readStream
                        .pipe(parser())
                        .pipe(pick({ filter: /data\..*\.cards/ }))
                        .pipe(streamArray());

                    jsonStream.on('data', (data) => {
                        const card = data.value;
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
                    });

                    jsonStream.on('end', () => {
                        outStream.write(']');
                        outStream.end();
                        resolve();
                    });
                    jsonStream.on('error', reject);
                });
            });
        });
    });

    if (fs.existsSync(TEMP_ZIP)) fs.unlinkSync(TEMP_ZIP);
    console.log(`✅ Success! Created ${OUTPUT_FILE}`);
}

bake().catch(err => {
    console.error('❌ Bake failed:', err);
    process.exit(1);
});
