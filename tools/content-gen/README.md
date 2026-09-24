# Place texts with Claude

The ~1,300 most notable places have hand-written texts in
`apps/mobile/content/places/`. This tool writes the rest — in the same format,
under the same rules (`apps/mobile/content/STYLE.md`) — with the Claude
Message Batches API.

```bash
cd tools/content-gen && npm install
export ANTHROPIC_API_KEY=sk-ant-...

# 1. choose places without texts (writes apps/mobile/content/places/input/gen-01.json)
node generate.mjs plan --name gen-01 --min-rank 4 --limit 3000

# 2. send them (all six languages in one request per place)
node generate.mjs submit gen-01                 # default model: claude-opus-5
node generate.mjs submit gen-01 --model claude-sonnet-5   # cheaper

# 3. wait and write the texts (usually under an hour)
node generate.mjs collect gen-01

# 4. check and build into the app
cd ../../apps/mobile
node content/validate.mjs && node scripts/content/build.mjs
```

Entries that break the limits are dropped and listed in `state/<name>.failed.json`;
run another `plan` later to pick them up again.

## Cost, roughly

One request per place writes all six languages: about 2,500 input tokens (the
style guide, cached after the first request) and 2,000–2,500 output tokens.
The Batch API halves the price.

| Model | Per place (batch) | The remaining ~8,000 places |
|---|---|---|
| claude-opus-5 | ~$0.03 | ~$260 |
| claude-sonnet-5 | ~$0.013 | ~$105 |
| claude-haiku-4-5 | ~$0.007 | ~$55 |

## Before shipping generated texts

Read a sample in each language (say 30 entries per batch), especially the
quiz answers and numbers. The truth rules in STYLE.md are in the prompt, but a
model can still be wrong about a small place; the input's own data (elevation,
population, country) is the ground truth to check against.
