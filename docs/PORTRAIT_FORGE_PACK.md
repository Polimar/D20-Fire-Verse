# Forge portrait pack

Target: **2** painted variants per **species × class × sex** (9 × 12 × 2 × 2 = **432**).

## Id scheme

`forge_{species}_{class}_{sex}_{variant}`  
Example: `forge_orc_barbarian_m_1`

Files: `tv/public/art/portraits/{id}.webp` (512×512).

## Builder UX

On **Name and portrait**: pick Female/Male, then one of the two matching forge portraits (falls back to classic faces if that combo is not painted yet).

## Import a generated image

```bash
node backend/scripts/import-forge-portrait.mjs path/to/image.png forge_human_rogue_f_1
```

Progress: `content/portraits/forge-pack-progress.json`.
