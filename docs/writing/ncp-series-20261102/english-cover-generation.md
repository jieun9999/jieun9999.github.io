# NCP series English cover localization

Built-in imagegen was used with each Korean PNG as its edit target. Korean originals remain unchanged. Each English PNG was opened and checked for spelling, dates, labels, arrow direction and clipping.

The supplied light editorial composition and per-part blue/green/orange accents take precedence over the general dark-cover default for this series. Native SVG body diagrams are translated separately.

## Part 1

- Reference: `public/covers/ncp-series-cover-01-terraform-nks.png`
- Final: `public/covers/ncp-series-cover-01-terraform-nks-en.png`

Prompt:

Edit target: supplied Korean blog cover part 1. Localize EVERY Korean label to English, preserving this exact flat off-white editorial infographic style, navy accents, composition, thin lines, 1920x1080 16:9 ratio and generous padding. Do not introduce new illustrations or decoration. Exact English copy: left headline in 3 lines "Rebuilding production / with Terraform / and NKS"; subtitle "Inspecting the existing infrastructure and rebuilding it in a new NCP account". Existing account card label "Existing account", footnote "Inspect configuration". New account card label "New NCP account". Retain TERRAFORM, NKS Kubernetes, DB PostgreSQL, Cache Redis, CD ArgoCD. Retain JIEUN.DEV / ENGINEERING NOTES and SERIES 01 / 03. Footer "Migration roadmap", range "2026.10.20 – 11.02"; six stages "Assessment" 10/20, "Decision" 10/21, "Infrastructure" 10/21, "Rehearsal" 10/22, "Cutover" 10/23, "Cleanup" 11/02. Keep original emphasis stages 1 and 3. No Korean letters. No actual hostnames, IPs, account IDs or credentials. Headline should fit without touching right diagram.

## Part 2

- Reference: `public/covers/ncp-series-cover-02-migration-strategy.png`
- Final: `public/covers/ncp-series-cover-02-migration-strategy-en.png`

Prompt:

Edit target: supplied Korean blog cover part 2. Translate EVERY Korean label into English, preserving flat off-white editorial infographic style, muted green accents, composition, thin lines, 16:9 wide ratio, generous padding. Exact left headline in 3 lines: "Why choose / a short maintenance / window?"; subtitle "Comparing blue-green, logical replication and dump/restore against service size and cutover risk." Right card heading "Migration options", label DECISION. Row01 "Blue-green"; note "Requires a connection to the existing DB"; badge "Deferred". Row02 "Logical replication"; note "Replication slots and sequence management"; badge "Deferred". Row03 "Dump / restore"; note "Brief write pause and a clear validation point"; badge "Selected". Retain JIEUN.DEV / ENGINEERING NOTES and SERIES 02 / 03. Footer "Migration roadmap", "2026.10.20 – 11.02"; six stages Assessment10/20, Decision10/21, Infrastructure10/21, Rehearsal10/22, Cutover10/23, Cleanup11/02. Keep original emphasis Decision. No Korean letters. No actual hostnames, IPs, account IDs or credentials. Labels fully fit.

## Part 3

- Reference: `public/covers/ncp-series-cover-03-rehearsal.png`
- Final: `public/covers/ncp-series-cover-03-rehearsal-en.png`

Prompt:

Edit target: supplied Korean blog cover part 3. Translate EVERY Korean label into English, preserving flat off-white editorial infographic style, muted burnt-orange accents, composition, thin lines, 16:9 ratio, generous padding. Exact headline in3lines "Production issues / found first / in rehearsal"; subtitle "Finding cutover errors early and measuring the switch with real data." Right card title "Three issues found in rehearsal". Row01 "Real-time message routing"; note "Repointing Centrifugo to the new cluster". Row02 "PostgreSQL extension schemas"; note "Handling extensions in cdb_admin". Row03 "Leftover Redis keys"; note "699 extra keys identified for cleanup". Do not imply permanent runner fix happened before actual productioncutover. Retain JIEUN.DEV / ENGINEERING NOTES and SERIES03 /03. Footer "Migration roadmap", "2026.10.20 – 11.02"; stages Assessment10/20, Decision10/21, Infrastructure10/21, Rehearsal10/22, Cutover10/23, Cleanup11/02. Keep original emphasis Rehearsal and Cutover. No Korean letters. No actual hostnames, IPs, account IDs or credentials. Fit all labels.
