import fs from 'fs';
import { pipeline } from 'stream/promises';
import yauzl from 'yauzl';
import StreamJsonParser from 'stream-json/Parser.js';
import StreamJsonPick from 'stream-json/filters/Pick.js';
import StreamJsonObject from 'stream-json/streamers/StreamObject.js';

const SOURCE_URL = 'https://mtgjson.com/api/v5/AllPrintings.json.zip';
const TEMP_ZIP = 'all-printings.zip';
const OUTPUT_FILE = 'mana-scribe-index.json';

async function bake() {
    console.log('🚀 Starting Object-Aware Streaming Bakery...');

    const response = await fetch(SOURCE_URL);
    if (!response.ok) throw new Error(`Download failed: ${response.statusText}`);
    await pipeline(response.body, fs.createWriteStream(TEMP_ZIP));
    console.log('📦 Download complete.');

    const outStream = fs.createWriteStream(OUTPUT_FILE);
    outStream.write('['); 
    let first = true;
    let cardCount = 0;

    await new Promise((resolve, reject) => {
        yauzl.open(TEMP_ZIP, { lazyEntries: true }, (err, zipfile) => {
            if (err) return reject(err);
            zipfile.readEntry();
            
            zipfile.on('entry', (entry) => {
                if (!entry.fileName.endsWith('.json')) return zipfile.readEntry();
                
                zipfile.openReadStream(entry, (err, readStream) => {
                    if (err) return reject(err);

                    // We use StreamObject because MTGJSON "data" is a { SET: {} } object
                    const jsonStream = readStream
                        .pipe(new StreamJsonParser())
                        .pipe(new StreamJsonPick({ filter: 'data' })) 
                        .pipe(new StreamJsonObject()); 

                    jsonStream.on('data', (data) => {
                        const set = data.value; // This is the Set Object (e.g., LEA)
                        if (!set.cards || !Array.isArray(set.cards)) return;

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
                                set_name: set.name,
                                collector_number: card.number,
                                rarity: card.rarity,
                                artist: card.artist,
                                scryfallId: card.identifiers?.scryfallId,
                                finishes: card.finishes || [],
                                attractionLights: card.attractionLights || [],
                                availability: card.availability || [],
                                boosterTypes: card.boosterTypes || [],
                                colorIdentity: card.colorIdentity || [],
                                defense: card.defense,
                                edhrecSaltiness: card.edhrecSaltiness,
                                faceConvertedManaCost: card.faceConvertedManaCost,
                                faceName: card.faceName,
                                flavorText: card.flavorText,
                                frameVersion: card.frameVersion,
                                hasFoil: card.hasFoil,
                                hasNonFoil: card.hasNonFoil,
                                isGameChanger: card.isGameChanger,
                                isPromo: card.isPromo,
                                isReprint: card.isReprint,
                                isReserved: card.isReserved,
                                language: card.language,
                                leadershipSkills: card.leadershipSkills,
                                life: card.life,
                                loyalty: card.loyalty,
                                originalReleaseDate: card.originalReleaseDate,
                                originalText: card.originalText,
                                otherFaceIds: card.otherFaceIds || [],
                                power: card.power,
                                printings: card.printings || [],
                                promoTypes: card.promoTypes || [],
                                securityStamp: card.securityStamp,
                                side: card.side,
                                sourceProducts: card.sourceProducts,
                                text: card.text,
                                toughness: card.toughness,
                                variations: card.variations || []
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

                    jsonStream.on('error', reject);
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
