# MAX context and pricing

MAX is an explicit context-window choice, separate from the `max` reasoning
effort. Its default is off. Global, workspace, and session settings use the
existing settings layers and apply to the next Run. A Run captures the effective
choice at admission, including while queued; changing settings does not change
an active Run. Older saved Runs without the field use standard context.

Configure `provider.maxMode` in Model settings. In a provider's model editor,
expand **MAX windows and billing rules** to set the standard capacity, base
rates, optional cache rates, optional MAX multiplier, and up to eight expanded
tiers. The Host description owns each field's component, order, type and bounds.
Tiers must have unique IDs, increasing windows and increasing input thresholds;
the threshold must be below its tier's window. MAX selects the largest declared
window. A model with no expanded tier keeps its sole window.

The meter and compaction use the captured window and reserve maximum output
capacity. Normal mode always compacts at the hard capacity boundary even if an
early-compaction policy declines. Exceeding the normal window never enables MAX
automatically. Context capacity is a local admission limit; billing thresholds
are independent input-token limits.

Rates are USD per million tokens. Actual provider-reported input, including cache
reads and writes, selects the last tier whose threshold is strictly exceeded.
That tier's rates apply to the whole request. Equality keeps the lower tariff.
Cache buckets are charged separately and subtracted from inclusive input exactly
once. Missing cache rates remain unavailable, rather than being assumed free.
An optional MAX multiplier is independent of prompt-length tariffs; an empty
multiplier means 1. Short requests in MAX keep base rates unless a multiplier was
explicitly configured. Every usage fact saves its selected rates, tier, context
mode and multiplier; later configuration changes do not recalculate history.

The official mechanisms differ:

- [OpenAI GPT-5.4](https://developers.openai.com/api/docs/models/gpt-5.4) and
  [GPT-6 Astra](https://developers.openai.com/api/docs/models/gpt-6-astra) have a
  1,050,000-token window, with long-context tariffs above 272,000 input tokens.
- [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing) lists Gemini
  2.5 Pro input, output and cache-read tariffs below and above 200,000 input
  tokens. A compatible provider can declare these tariffs; this feature does not
  add a new Gemini transport.
- [Anthropic pricing](https://platform.claude.com/docs/en/about-claude/pricing)
  keeps standard per-token rates for most Claude 4.6 and later models' 1M window.
- [Cursor MAX](https://cursor.com/help/ai-features/max-mode) documents API rates
  plus 20% specifically for legacy request-based plans. hbar has no default 20%
  surcharge; configure 1.2 only when the chosen service actually charges it.

New direct-provider presets include documented OpenAI GPT-5.4 / GPT-6 Astra
standard 272K and MAX 1.05M rules. Claude Opus/Sonnet 4.6 presets use a conservative
200K normal window and their 1M MAX window at the same rates. That 200K normal
window is hbar's operating choice, not a claim of a cheaper Anthropic tariff.
Gateway presets retain their own metadata and pricing. Presets never rewrite
already saved provider profiles.

The settings editor follows
[ReactBits settings-form](https://pro.reactbits.dev/docs/app-ui/settings-form):
one owning page scroll region, collapsible sections, nearby validation and a
persistent save/reset footer. Bounded tier rows grow with content, and their
schema-driven number fields wrap into fewer columns on narrow screens. Lumen
provides the theme, field, disclosure and icon semantics.
