import fs from 'fs';
import { Readable } from 'stream';
import { finished } from 'stream/promises';
import { createUnzip } from 'zlib';

const SOURCE_URL = 'https://mtgjson.com/api/v5/AllPrintings.json.zip';
const OUTPUT_FILE = 'mana-scribe-index.json';

async function bake() {
    console.log('🚀 Starting the Bakery for ManaScribe...');

    const response = await fetch(SOURCE_URL);
    if (!response.ok) throw new Error(`Download failed: ${response.statusText}`);
    
    console.log('📦 Unzipping AllPrintings (Complete Collector Data)...');
    const zipStream = Readable.fromWeb(response.body);
    const unzip = createUnzip();
    
    let fullData = '';
    unzip.on('data', chunk => fullData += chunk.toString());
    zipStream.pipe(unzip);

    await finished(unzip);
    const mtgData = JSON.parse(fullData).data;

    const flattenedCards = [];

    console.log('🔪 Mapping fields to match ManaScribe App Code...');
    for (const setCode in mtgData) {
        const set = mtgData[setCode];
        
        // We only process 'paper' sets to keep the file size smaller for mobile
        if (set.isOnlineOnly) continue; 

        for (const card of set.cards) {
            flattenedCards.push({
                // Primary Search Fields (Matches your search UI)
                id: card.uuid, 
                name: card.name,
                mana_cost: card.manaCost || "", // Mapped for your existing Display logic
                cmc: card.manaValue, 
                
                // Type Builder Fields (Directly from MTGJSON arrays)
                type_line: card.type,
                supertypes: card.supertypes || [],
                types: card.types || [],
                subtypes: card.subtypes || [],

                // Collector Specific Fields
                set: set.code.toLowerCase(),
                set_name: set.name,
                collector_number: card.number,
                rarity: card.rarity,
                artist: card.artist,
                
                // The "Golden Key" for Scryfall Hybrid Images
                scryfallId: card.identifiers?.scryfallId,
                
                // Finishes for the "Collector Experience"
                finishes: card.finishes, // ['foil', 'nonfoil', etc]
                isPromo: card.isPromo || false
            });
        }
    }

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(flattenedCards));
    console.log(`✅ Success! ${flattenedCards.length} printings baked into ${OUTPUT_FILE}.`);
}

bake().catch(err => {
    console.error('❌ Bake failed:', err);
    process.exit(1);
});
