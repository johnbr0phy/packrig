# Top tube slot audit — front vs. rear mount

101 products in `data/brands.json` carry `slot: "toptube"` (94) or `slot: "toptube_rear"` (7).
Every one was reviewed. Where the maker's page states a mounting position it was fetched and quoted;
where it does not, the product was left alone.

**Result: 3 to move to `toptube_rear`, 0 to move to `toptube`, 16 unresolved (all left as-is).**

---

## 1. Currently `toptube`, evidence says REAR

| Brand | Product | dims_cm (l×w×h) | h/l | Evidence | Link |
|---|---|---|---|---|---|
| Oveja Negra | Snack Pack **Small** | 15.2 × 5.1 × 11.4 | 0.75 | Maker's own spec bullet, first line of FEATURES/SPECS: *"Snack Pack Small's are designed to fit at the seat tube/top tube junction of your frame"*. The catalogue record already carries `features.fit: "seat tube/top tube junction"` — the slot just never followed it. | [product page](https://www.ovejanegrabikepacking.com/products/snack-pack-top-tube-bag-small) |
| Oveja Negra | Snack Pack **Small Angle** | 15.2 × 5.1 × 11.4 | 0.75 | Maker's own spec bullet: *"Small Angle Snack Pack's are designed to fit frames with molded or braced top tube/ seat tube junctions"*. The "angle" in the name is the top tube/seat tube junction angle, not a stem angle. Same body as the Small with an angled rear face (`features.shape: "angled rear face"`). | [product page](https://www.ovejanegrabikepacking.com/products/snack-pack-small-angle) |
| Rockgeist | Custom Medic Top-Tube Bag **(saddle side)** | 20 × 6 × 9 | 0.45 | Maker's page: *"Custom shaped to your seat post/top tube"*. The variant name in the catalogue is already "(saddle side)". A review on the same page draws the contrast explicitly: *"I definitely wanted a Top Tube (saddle side) bag vs a TT/Headtube version to keep weight more centralized on the bike."* Rockgeist sells the Medic in both orientations; this record is the rear one. | [product page](https://rockgeist.com/product/medic-bag/) |

**Note on the Oveja Negra family.** Only the two Small variants move. The maker splits the line by
position and says so on the other page: *"Large and XL designed to fit at stem/steer tube"*
([Large/XL page](https://www.ovejanegrabikepacking.com/products/snack-pack-top-tube-bags-large-xl)),
and the BOLT-ON record carries `features.fit: "stem/steer tube"`. Snack Pack Large (0.50), XL (0.50)
and BOLT-ON (0.47) all stay `toptube`.

This also revises the premise in the brief that "Oveja Negra's Snack Pack is 0.75 and is a front bag".
The 0.75 ratio belongs to the two Small variants specifically, and those are the rear ones. The ratio
heuristic was pointing at the right bag; the counter-example was mis-drawn. It remains true that ratio
alone is not sufficient — see §3.

## 2. Currently `toptube_rear`, evidence says FRONT

None. All 7 rear-slotted records hold up.

Sanity check of the pre-confirmed list, as asked:

| Product | Verdict | Evidence |
|---|---|---|
| Apidura Backcountry Rear Top Tube Pack | REAR, correct | `features.attachment: "one Hypalon velcro strap to top tube + two to seatpost"` — decisive on its own. |
| Restrap Adventure Rear Top Tube Bag | REAR, correct | Name; seat-tube wedge shape; 0.72 ratio. |
| Tailfin Rear Top Tube Bag (0.9L Road/Gravel, 0.8L MTB) | REAR, correct | Maker's own product name and a dedicated product page separate from the Top Tube Bag. |
| Andrew The Maker ATM Rear TT Sack | REAR, correct | `features.mount: "two straps at the seat tube / top tube junction, rear-facing"`. |
| Revelate Jerrycan, Regular and Bent | REAR, correct | Revelate's page title is literally "Jerrycan rear mount top tube bag"; retailers quote *"The Jerrycan is rear-mount specific; it will only work up front if you have a minimum of 2 inches total of spacers and headset stack under your stem."* Retailers list it as a "Top-tube/Seatpost Bag". The Bent version *"accommodates deeply slanted seat tubes, gusseted braces at the seat tube / top tube junction, or bikes with minimal exposed seat post"* — that is a rear-fit description. |

**One dimensional flag, not a slot flag.** The two Tailfin rear bags have ratios of 0.36 and 0.28,
far below the 0.67–0.91 band the other confirmed rear bags occupy. Their `dims_note` says the dims are
an unverified catalogue estimate because Tailfin publish only a print-at-home template. The slot is
right; the numbers are probably wrong and are worth a separate pass. Do not let those two ratios
widen the rear band in any downstream heuristic.

## 3. Unresolved — left unchanged

Two kinds. Neither justifies a move.

**(a) Maker explicitly says either end.** These are genuinely dual-position bags. They keep `toptube`
because that is the shape they are built to and, where stated, the default the maker describes.

| Brand | Product | h/l | What the maker says |
|---|---|---|---|
| Miss Grape | Node, Node 2H (Adventure and Road), Big Node, Big Node 2H — 6 records | 0.23–0.48 | *"The Node fits on the top tube of your frame and can be positioned either at the height of the headset or close to the seat post."* |
| AGU | Top-Tube Frame Bag Venture Extreme | 0.29 | *"You can attach this bag to the top tube of your frame and either your stem or seatpost."* Separately: its dims (21 × 11 × 6) look like wid/hgt may be transposed — worth checking against the 0.7L rating. |
| Nuke Sunrise | Titan Tank | 0.50 | *"A classic top tube tang bag usually positioned behind the stem"*, but *"some like it attached at the seat post"*. Front is the stated default, so `toptube` is right. |
| Banjo Brothers | Top Tube Bag, Large | 0.57 | Described as front-and-centre on the cockpit, with *"Can also be attached at the seat-post."* |
| Venture Handmade | Cache Tank Bag | 0.50 | *"Since positioning is independent along top tube, the Cache can easily be moved to avoid strap conflicts"* — no stem attachment at all, so it floats. |

**(b) No positional statement anywhere I could find.** All are long-and-low in profile, consistent with
a front bag, and none carries a rear cue in name or features. Left as `toptube`.

| Brand | Product | h/l | Why unresolved |
|---|---|---|---|
| Salsa (EXP Series) | EXP-R Trillium Top Tube Bag | 0.35 | Page gives only *"Mounts with three TPU-coated webbing straps"* and "universal front triangle fit". |
| VAUDE | Trailtop Tube | 0.42 | Page gives only *"can be attached with straps or screws"*. |
| Altura | Vortex Bolt-On | 0.45 | Page gives only bolt-or-strap; bolt-on implies top tube bosses, which are forward, but that is inference not evidence. |
| Giant | Scout Top Tube Bag | 0.45 | *"attaches to top tube with hook and loop fasteners or on-bike top tube bolts"* — position unstated. |
| Outer Shell | Top Tube Bag | 0.48 | Bolt-on/strap-on only. |
| Nuke Sunrise | MegaTitan | 0.43 | Long mounting paragraph describes *how*, never *where*. Sibling Titan defaults to behind the stem, which is suggestive but is a different product. |
| Blackburn | Local Plus Top Tube Bag | 0.44 | Not found; the sibling Outpost is confirmed front (below). |
| Fjällräven | Hoja Top Tube Bag | 0.38 | fjallraven.com returns 403; no retailer found quoting a position. |

**What would settle group (b):** a maker fitting photo showing the bag on a complete bike, or a strap
count that names its third anchor. Every confirmed front bag in this catalogue anchors to something at
the front — stem, steerer, head tube, or headset — and every confirmed rear bag anchors to the seatpost
or the seat tube junction. The third strap is the tell. Retailer listings that name the anchor
("two straps on the top tube and a third on the stem") were sufficient for several products below.

## 4. Confirmed FRONT during the sweep (no change needed)

Recorded so this ground does not get re-walked. Each of these was verified against the maker's page or
a retailer quoting the maker, and the anchor point is the evidence.

- **Green Guru Tanker** — *"It mounts right behind the stem of the bike and is strapped to both the top and the head tube."* Despite the "Tanker" name.
- **EVOC Top Tube Pack WP** — *"The bag is mounted directly behind the stem on the top tube."*
- **Topeak TopLoader** — *"Straps securely to the head tube and top tube"*, with a head tube diameter spec (ø38–52 mm).
- **Road Runner Bluff** — *"Install the head tube strap as the 3rd mount for the bag, which keeps the bag snug against the head tube."*
- **Swift Moxie** — *"tucks tidily into the nook against your stem and top tube."*
- **Blackburn Outpost** — *"two straps on the top tube and a third on the stem."*
- **Cedaero Tank Top Pack** — *"a single adjustable OneWrap velcro strap which secures by the stem."* Despite the "Tank Top" name.
- **Two Wheel Gear Commute** — *"2 bottom velcro straps to attach to the top tube and a front velcro strap to the handlebar stem."*
- **Buckhorn 8in** — *"pass through at the head tube perfect for your hydration bladder hose."*
- **Rogue Panda Alamo** — bolt spacing spec measured *"from the back of the stem."*
- **Straight Cut Custom** — the DeWidget accessory anchors it to the steerer tube.
- **WOHO XTouring** — *"elastic cord fixation at the headset."*
- **JPaks SnakPak** (both sizes) — *"tapered design from front to back, ensuring clearance for your knees"*, i.e. it sits behind the stem and drops away rearward.
- **Apidura** (all 13 front records) — `features.attachment` on every one ends "+ one to steerer".
- **Rockgeist Cache** (6 records) — `features.shape: "tapered, wider at the stem"`.
- **Oveja Negra Snack Pack Large / XL / BOLT-ON** — *"designed to fit at stem/steer tube."*
- **Atelier Velocidade Funambule** — `features.mount: "velcro to the stem plus two polyurethane frame straps"`.
- **Andrew The Maker ATM Top Tube Bag** — cable pass-through at the front lower corner, B-RAD compatible; the maker's separate rear product is the Rear TT Sack, already slotted correctly.
- **Revelate Gas Tank, Mag-Tank, Mag-Tank 2000, Mag-Tank FastTrack, Legacy Mag-Tank, Extended Play** — the catalogue's own photo notes describe a wedge tapering to a point *at the head tube*. Revelate's rear product is the Jerrycan, already slotted correctly. The "Tank" names are not evidence, as the brief warned.
- **Chrome Holman** — catalogue note cites Chrome's on-bike shot: lengthwise behind the stem, two straps under the tube plus a drawcord round the steerer.
- **Restrap Adventure / Race / Aero Race** — the Race size guide gives separate front and rear heights with the tall end forward; Restrap's rear product is the Adventure Rear, already slotted correctly.
- **Tailfin Top Tube and Long Top Tube** — Tailfin sell the Rear Top Tube Bag as a distinct product, already slotted correctly.

---

### Method note

Ratio was used only to order the queue, never to decide. Of the six highest-ratio `toptube` records,
two turned out to be rear (both Oveja Negra Smalls) and the rest are documented front bags. The one
reassignment the ratio test would have missed entirely is the Rockgeist Medic at 0.45, which sits
below the slot median and is rear anyway. Anchor point beats proportion every time.
