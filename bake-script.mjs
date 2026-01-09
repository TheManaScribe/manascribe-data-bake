import fs from 'fs';
import AdmZip from 'adm-zip';

const SOURCE_URL = 'https://mtgjson.com/api/v5/AllPrintings.json.zip';
const OUTPUT_FILE = 'mana-scribe-index.json';

async function bake() {
    console.log('🚀 Starting the Bakery...');

    // 1. Download as Buffer
    console.log('📦 Downloading AllPrintings Zip...');
    const response = await fetch(SOURCE_URL);
    if (!response.ok) throw new Error(`Download failed: ${response.statusText}`);
    const buffer = Buffer.from(await response.arrayBuffer());

    // 2. Extract using AdmZip
    console.log('🔓 Extracting JSON...');
    const zip = new AdmZip(buffer);
    const jsonEntry = zip.getEntries().find(e => e.entryName.endsWith('.json'));
    const mtgData = JSON.parse(jsonEntry.getData().toString('utf8')).data;

    const flattenedCards = [];

    console.log('🔪 Flattening and mapping fields...');
    for (const setCode in mtgData) {
        const set = mtgData[setCode];
        if (set.isOnlineOnly) continue; // Skip digital-only cards

        for (const card of set.cards) {
            flattenedCards.push({
                id: card.uuid, // Local Unique ID
                name: card.name,
                mana_cost: card.manaCost || "",
                cmc: card.manaValue || 0,
                type_line: card.type,
                // Pre-split types for your Type Builder
                supertypes: card.supertypes || [],
                types: card.types || [],
                subtypes: card.subtypes || [],
                // Collector Data
                set: set.code.toLowerCase(),
                set_name: set.name,
                collector_number: card.number,
                rarity: card.rarity,
                artist: card.artist,
                // Image Key
                scryfallId: card.identifiers?.scryfallId,
                finishes: card.finishes || []
            });
        }
    }

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(flattenedCards));
    console.log(`✅ Success! Created ${OUTPUT_FILE} with ${flattenedCards.length} printings.`);
}

bake().catch(err => {
    console.error('❌ Bake failed:', err);
    process.exit(1);
});
