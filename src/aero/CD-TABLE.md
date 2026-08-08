# The drag coefficient table

Every number in `src/aero/model.js`, what it is, and why it is that and not
something else.

**Read this first.** None of these coefficients were measured in a wind tunnel.
They are an engineering model: standard bluff-body coefficients for the shapes
involved, adjusted for where on the bike each shape sits, then calibrated so
that the whole-bike answers land on published CdA figures for a bare bike, a
rider, a handlebar roll and a set of panniers. Where a value is my own judgement
with no source behind it, this document says so in as many words. That happens
often, and it is the honest state of the art for bikepacking luggage — I could
not find a wind-tunnel dataset for bikepacking bags that I can cite with
confidence, and I have not invented one.

What that means for the reader: **trust the ranking, treat the absolute watts as
an estimate.** Comparing two setups in this tool is on firm ground. Quoting "my
rig costs 17 watts" to three significant figures is not.

---

## 1. Reference area — the thing everything else depends on

A drag coefficient is meaningless without the area it is referenced to.

These coefficients are referenced to each part's **marginal frontal area**: the
silhouette that part adds which was not already blocked by the bike or rider,
measured on the GPU from the real geometry by `aero/measure.js`. This is the
definition that makes the contract's promise work — that `parts` sums to
`cdaHeadOn`. Every part accounts for exactly the air it is the first thing to
meet.

It also happens to be what makes the numbers come out right. A 20 cm × 50 cm
handlebar roll has 0.10 m² of its own frontal area; at any plausible cylinder Cd
that would be a catastrophic 0.05–0.1 m² of CdA, which is not what anybody
measures. Most of that area was already occupied by arms, hands, head tube and
the front of the frame. The marginal area is nearer 0.05 m², and at Cd 0.45 that
lands on the 0.02–0.03 m² everyone reports.

**Consequence to be aware of:** a seat pack tucked directly behind the rider has
almost no marginal area at zero yaw, so head-on it costs almost nothing. That is
physically true and is the main reason seat packs are the cheapest big-volume
bag on a bike. Its cost appears in the yaw sweep, where it swings out of the
rider's shadow.

## 2. Where flow context lives

Two bags of identical shape do not cost the same in different places. A fork bag
stands in clean, undisturbed air. A seat pack lives in the rider's wake where
the dynamic pressure is a fraction of freestream.

**This used to be handled inside the Cd, and no longer is.** The base table is
still keyed on slot first and shape class second, and the slot still carries
*some* position — a pannier hung out beside the wheel is genuinely blunter in
the flow than a top tube bag tucked against the frame. But **being in something
else's shadow is now measured and priced separately**, by `wakeDiscount` (§ 9),
because the engine can see exactly which pixels of a bag are shielded and which
are not.

That split matters, and getting it wrong is the same error as the frame-bag
fairing credit in a different costume. When `wakeDiscount` landed, three slots
had to be **re-based upward**: a seat pack read 0.34 where a saddlebag of the
identical wedge shape read 0.42, and that 0.08 gap *was* the rider's wake,
sitting inside the coefficient. Multiplying it by a wake discount as well would
have charged the wake twice and made seat packs absurdly cheap. `seatpack`,
`toptube_rear` and `downtube` are now clean freestream shape coefficients. See
§ 4 and § 9.

The rule going forward: **the Cd is what the shape costs in clean air. Shadow is
measured, not assumed.**

*The residual positional judgement is mine.* The shape component is anchored in
published bluff-body data; the remaining slot-to-slot variation is reasoning
about exposure, not measurement.

## 3. Body coefficients

| Key | Cd | Reasoning |
|---|---|---|
| `bike` | 0.90 | Frame, fork, bars and cranks are round tubes. A lone smooth cylinder in crossflow sits at Cd ≈ 1.1–1.2 subcritical (Hoerner, *Fluid-Dynamic Drag*, 1965 — the standard reference for all the bluff-body numbers in this document). The counted silhouette is well below that because much of it is tube standing in another tube's wake: the down tube behind the front wheel, the seat tube behind the down tube, the whole rear triangle behind all of it. A body in a wake does not pay full price. |
| `wheels` | 0.85 | Slightly *below* the frame, which is not the obvious guess. Head-on a wheel is mostly tyre band and genuinely bluff, but the silhouette also counts 32 spokes and a hub that block far less than their pixel count implies, and the rear wheel sits in the front wheel's wake. Rotational drag, which no silhouette can see, is folded back in here. |
| `rider` | 0.82 | A human bluff body runs Cd ≈ 0.9 sitting up and ≈ 0.7 in a deep tuck. Hoods sit between. |
| `racks` | 0.90 | Deliberately identical to `bike` — same round alloy tubing, same family, and a distinct number would be judgement with nothing behind it. Two effects roughly cancel: a rack's 10 mm tube sits at a lower Reynolds number, where a smooth cylinder's Cd is if anything *higher*, while an open rack lattice shields itself less than a frame does. Written out rather than left to fall through, so it survives someone later changing `bike`, and because without the entry `cdOf` returns a **top tube bag's** 0.58 for it. |

A rack is a reserved part, so it gets **no wake discount** despite living deep in
the rider's shadow. That over-charges it slightly, which is the right
conservative direction and is deliberate — a rack is the one part of fitting
panniers you cannot take off, and it belongs on the pannier's bill.

Source for the CdA targets these are tuned against: the standard figures in
Wilson & Papadopoulos, *Bicycling Science* (MIT Press), and the road-cycling
power literature — bike alone ≈ 0.08–0.10 m², bike plus rider on the hoods
≈ 0.36 m², dropping to ≈ 0.30 m² in the drops.

**These two were revised down** from 1.00 and 1.10 once the measurement engine
existed. They were originally set against my *estimate* of the frontal areas;
the engine reports 0.0675 m² of frame and 0.0354 m² of wheel, and against those
real numbers the old pair produced 0.1065 m² for a bare bike — 18% above the
anchor. 0.90 and 0.85 land it on **0.0909 m²**. The revision changed the ratio
as well as the scale: I had wheels above the frame, on the argument that spokes
churn air they do not block. That argument is about *yaw*, where the spoke area
balloons, and § 8 now handles it properly; at zero yaw the wheel silhouette is
mostly tyre band and the shielding argument dominates instead.

## 4. Base Cd by slot and shape class

Shape class is derived from the catalogue's `features.shape` free-text field.
About a third of products have no usable shape string; those fall to the slot's
`default`, which is set slightly pessimistic on purpose so an undocumented bag
never grades better than a documented one.

| Slot | wedge | round | box | frame | harness | default |
|---|---|---|---|---|---|---|
| `seatpack` † | 0.42 | 0.52 | 0.62 | – | 0.60 | 0.46 |
| `saddlebag` | 0.42 | 0.48 | 0.56 | – | – | 0.50 |
| `barroll` | 0.42 | **0.45** | 0.58 | – | 0.55 | 0.46 |
| `barbag` | 0.52 | 0.50 | 0.62 | – | – | 0.58 |
| `randobag` | 0.60 | 0.62 | 0.74 | – | – | 0.70 |
| `framebag_full` | – | – | – | **0.26** | – | 0.26 |
| `framebag_half` | – | – | – | **0.30** | – | 0.30 |
| `toptube` | 0.50 | 0.52 | **0.62** | – | – | 0.58 |
| `toptube_rear` † | 0.50 | 0.52 | 0.62 | – | – | 0.58 |
| `stem` | 0.55 | 0.56 | **0.64** | – | – | 0.60 |
| `fork` | 0.56 | 0.58 | 0.70 | – | – | 0.62 |
| `downtube` † | 0.44 | 0.48 | 0.56 | – | – | 0.50 |
| `pannier` | 0.86 | 0.80 | **1.05** | – | – | 1.00 |
| `trunk` | 0.52 | 0.56 | 0.66 | – | – | 0.62 |

† **Re-based upward when `wakeDiscount` landed.** These three used to carry the
rider's or the wheel's wake inside the coefficient — `seatpack` wedge read 0.34
against `saddlebag`'s 0.42 for the identical shape. Shadow is now measured and
priced by § 9, so these had to become clean freestream values or the wake would
be charged twice. The *effective* coefficient on a fully shadowed seat pack is
now 0.42 × 0.65 = **0.27**, against the 0.34 it used to carry.

Bold values are the anchors; the rest are interpolated around them by the
reasoning below.

**Why a wedge is ~0.42.** A body with a blunt rounded nose and a long taper into
its own wake is the classic low-drag bluff form; a hemisphere-nosed streamlined
body is Cd ≈ 0.2–0.4 depending how far the tail is carried. A seat pack is a
short, fat, fabric version of that — softer-edged and bulging, so above the
ideal. This is the lowest shape class in the table outside the frame bags, and
it deserves to be. Note this is now a **clean-air** figure: the reason a seat
pack ends up the cheapest big-volume bag on a bike is the wake it sits in, and
that is applied separately in § 9.

**Why a roll end is ~0.45.** A handlebar roll is a finite cylinder with its axis
*across* the flow, which taken alone would be Cd ≈ 1.1. It is not alone: it sits
in the gap between the rider's arms, ahead of the head tube, partly filling a
region that was already turbulent. It is also the calibration anchor — 0.45 is
the number that puts a big roll at the published 0.02–0.03 m². *Judgement,
calibrated rather than derived.*

**Why a flat pannier face is 1.05.** This is close to a literal textbook value:
a cube is Cd ≈ 1.05, a square flat plate normal to the flow ≈ 1.17. A rear
pannier is a slab with a squared-off leading face, hung out in the open beside
the wheel where the rider's wake does not reach it. 1.05 is the best-sourced
number in this table.

**Why boxy stem and top-tube bags are ~0.60–0.64.** Small blocks with rounded
corners, out in the open ahead of and beneath the hands. A rounded-corner box
sheds a good deal less than a sharp one, so they sit meaningfully below the
pannier's 1.05 despite the similar family of shape. *Judgement.*

**Why fork bags read higher than their shape suggests.** Position, not form.
They are the only luggage on the bike standing in genuinely clean air, out
beyond the fork legs where nothing shields them, and they are the first thing
the crosswind finds at yaw.

**Unmodelled credit worth noting:** it is regularly argued that stem bags
partially fair the gap between the rider's forearms and are cheaper than they
look. That is plausible and I have not credited it, because unlike the frame
bag case I have no way to bound the size of it. If a tunnel test ever lands,
this is the first row to revisit.

## 5. The frame bag and its fairing credit

This is the most interesting true result in bikepacking aero, and the one most
easily faked, so here is exactly what the model does.

**The bag's own Cd is 0.26 (full) / 0.30 (half).** A frame bag is a tall, thin,
streamwise-aligned panel with a rounded leading edge — geometrically much closer
to a faired strut than to a box. Streamlined bodies aligned with the flow are
Cd ≈ 0.04–0.1; a fabric panel that bulges and has a zip down it is nowhere near
that good, but it is a long way below anything blunt. Full reads lower than half
because it caps the triangle from head tube to seat tube in one continuous
surface, where a half bag leaves an exposed lower edge shedding its own shear
layer.

**The credit is now ZERO for both slots, and that is a result rather than a
gap.** It started at −0.006 as an estimate. The experiment has since been run
against the real geometry (Apidura Full Frame Pack, head-on, five-yaw sweep):

```
baseline (bags hidden)      0.10433 m²
loaded, before any credit   0.10639 m²
delta                      +0.00207 m²      <- about +0.8 W at 28 km/h

frame bag's own cost        +0.00235 m²
bike part shrink            +0.00028 m²      <- essentially nil
wheels                       unchanged, as expected
```

**+0.00207 m² is the answer.** A full frame bag costs under a watt. That IS the
"frame bags are essentially free" result, and it now falls out of measured
geometry instead of out of a constant chosen to produce it — which is a far
stronger claim, and the standard the rest of this document is held to.

Applying the −0.002 would have landed the net on 0.00007 m², suspiciously
perfect. The original −0.006 would have made it net *negative*: the tool
asserting that bolting a bag to your frame makes you faster. That is exactly the
fabricated headline this whole exercise existed to avoid.

### The case for zero is robustness, not just epistemics

There is a real argument the other way, and it deserves stating: the
flow-quality effect (b) below is genuine physics, and −0.002 is a defensible
size for it. Setting it to zero asserts it is exactly zero, which is also a
claim. On the measurement alone the two choices are indistinguishable — +0.00207
and +0.0003 are both comfortably "within noise of zero", which was the
calibration anchor.

What breaks the tie is **which way each fails**. With no credit, the reported
figure is a positive measured area times a positive Cd: it cannot go negative,
for any frame, any bag, any size. With −0.002 applied, the net sits at
+0.0003 — about 3 parts in 10,000 of the whole-bike CdA — so a slightly smaller
bag, a smaller frame, or a different product flips the sign and the HUD tells
the rider a frame bag makes them faster. The credit's uncertainty (±100%, by my
own estimate) is six times the margin it leaves.

A tool that says "a frame bag costs 0.8 W" when the truth is 0.0 W is mildly
wrong in a way nobody will notice. A tool that says "a frame bag saves you
watts" is spectacularly wrong in a way that discredits everything else on the
panel. Zero is chosen because it cannot produce the second failure.

### Two things worth keeping straight

**The area swap barely happens, and the reason is interesting.** It was expected
to: a frame bag occluding the down tube should move pixels from the `bike` part
to the bag, where they are priced at a much lower Cd. Measured, the bike part
gives up 0.00028 m² — nothing. Head-on there is almost no frame *behind* the
bag to swap, because the bag sits in the narrow slot **between** the tubes that
form the silhouette rather than in front of them. It is tucked inside the frame,
not covering it. Its own measured area is only about 94 cm², which is right for
a pack seen edge-on with the head tube and down tube taking up much of the view.

This is not a measurement failure. The pipeline is demonstrably occlusion-aware:
the occluded-plate test reads exactly 0.000000, and in a full-kit measurement a
seat pack behind the rider reads 0.0001 m².

**The flow-quality effect is real physics and is deliberately not modelled.**
Capping the triangle genuinely does stop air spilling through it and stop the
down tube and seat tube shear layers interacting. But it is below what this rig
can resolve — smaller than the +0.00207 the measurement already carries — and
putting a number on it would be asserting precision the apparatus does not have.
It is left unmodelled on purpose, not forgotten.

`fairingCredit()` and its plumbing stay in place. A zero return is a harmless
no-op, and the mechanism is there for a future measurement that earns it.

### One more real effect, arriving by measurement

The +0.00207 above was measured before a baseline bug was fixed: a full frame
bag hides the bottles in **both** the baseline and the loaded pass, so getting
your bottles out of the wind — a genuine and frequently-cited benefit of a frame
bag — was invisible to the comparison. It is worth roughly 4% of the baseline.

So expect this figure to move down once that lands, and possibly to cross zero.
**That is fine, and it is the opposite of the situation this section warns
about.** A negative number arrived at by measuring a real effect is a result. A
negative number arrived at by applying a hand-set constant is a fabrication. If
the frame bag ends up marginally net-negative because the engine can now see the
bottles it swallowed, that is the tool working. Update the numbers here when it
does, and say which measurement produced them.

### The limit of the claim: this is head-on only

The frame bag is cheap here partly because it is *shielded* — tucked between the
tubes and behind the front wheel. At yaw it stops being shielded, its silhouette
grows 3.05× by 20° (§ 8.5), and its cost rises with it: measured, a full frame
bag runs **1.78× its own head-on CdA at 20°**. "Nearly free" is a head-on
statement. The yaw sweep is where the rest of the bill arrives, and the weighted
figure the HUD shows already includes it.

## 6. Fabric modifier

Keyed on `brand.fabricKey`, which `catalog.js` derives from each brand's
published fabric string.

| `fabricKey` | Modifier | Reasoning |
|---|---|---|
| `tpu` | ×0.97 | Welded TPU laminate. No exposed stitching, no nap, and it holds its shape between mounting points. |
| `xpac` | ×0.98 | X-Pac / EcoPak sailcloth laminate. Smooth, stiff face. |
| `cordura` | ×1.00 | 500–1000D textured nylon. The reference. |
| `waxed` | ×1.02 | Waxed canvas and cotton duck. Heavy, and it sags and flaps between mounts. |

A ±3% band, and it should stay small. **Be clear about what this represents:** on
a body whose drag is dominated by where the flow separates, surface finish is a
second-order effect — the separation point is set by the geometry, not the
weave. What actually differs between these fabrics is how tautly the panel sits
and whether it flutters. That is a real effect and it correlates with fabric, so
the modifier is keyed on fabric; but it is a proxy, and the whole row is
*engineering judgement, not measurement.*

One genuine nuance the model does **not** capture: on a large rounded body near
its critical Reynolds number, surface roughness can trip the boundary layer and
*reduce* pressure drag — the golf-ball effect. A 20 cm handlebar roll at 8 m/s
is around Re 10⁵, which is in the neighbourhood where that starts to matter. So
it is not impossible that rough Cordura beats smooth laminate on a big bar roll.
Modelling that properly needs a tunnel, so the model takes the simple, more
commonly-true direction and this paragraph records the doubt.

## 7. Feature penalties

Additive on Cd, applied before the fabric modifier, from `product.features`.
Total capped at **+0.12** so a heavily-featured bag can never become more
appendage than shape; when the cap bites, the individual entries are scaled
proportionally so the breakdown the UI shows still adds up to the number it
prints. Final Cd is clamped to [0.15, 1.40].

| Feature | Penalty | Reasoning |
|---|---|---|
| Daisy-chain webbing (`daisyChains`) | +0.030 | Rows of webbing loops standing proud of the shell. Each loop is a small bluff step in the boundary layer, and the loops flutter. Genuinely draggy — a real and frequently-noted cost of a lash-everything bag. |
| Bungee lattice (`cord`) | +0.040 | The largest single penalty. Criss-cross cord stands well proud, sheds vortices along its whole length, and vibrates. |
| External mesh / stretch / open pocket | +0.030 each, cap +0.060 | Porous and fuzzy, and an open pocket mouth is a cavity that traps and dumps flow. |
| External zip / slip pocket | +0.010 each, cap +0.020 | A modest applied step on an otherwise smooth face. |
| Roll-top closure | +0.020 | The rolled section stands proud as a blunt squared cap rather than following the body line. |
| Flap and buckle closure | +0.030 | Loose strap tails, and a flap edge that lifts. |
| Exposed harness / cradle | +0.045 | Alloy plates, wide bands and a drybag that never quite sits flush. The worst of the closure types. |
| Drawcord / cinch | +0.015 | A puckered, untidy end where a clean one would do. |
| Compression strap (`compressionStraps`) | +0.006 each, cap +0.020 | Nearly a wash. The strap tail flaps, but the strap itself pulls the panel taut, which helps. Small and positive is the honest net. |
| Zips, magnetic and hard lids | 0 | Flush. Nothing to charge for. |

**All of these magnitudes are my judgement.** The *direction* of each is not in
doubt — none of these features can possibly reduce drag — but nothing here is
calibrated against a measurement of that specific feature. They are sized
relative to one another and to the base coefficient so that a maximally
festooned bag ends up roughly 25–35% worse than the same bag clean, which is the
right order of magnitude for appendage drag on a bluff body.

Note the penalties are absolute Cd adders, so the same +0.030 for daisy chains
is proportionally harsher on a frame bag (base 0.26) than on a pannier (base
1.05). That is intended: a webbing ladder across an otherwise smooth faired
panel is a bigger relative insult than the same webbing on a slab that was
already separating everywhere.

## 8. Yaw

### 8.1 How much time is spent at each angle

`YAW_WEIGHTS` — 30 / 27 / 20 / 14 / 9 percent across 0°, 5°, 10°, 15°, 20°.

Real riding almost never happens at exactly zero yaw and rarely reaches 20°. The
*shape* of this distribution follows FLO Cycling's published real-world yaw
measurements, which found most riding time falls under 10° of apparent yaw with
a long thin tail beyond that. **The five specific numbers are my own smoothing of
that shape onto a 5° grid, not their data** — do not cite them as such.

### 8.2 Turning projected area into drag along the road

This section exists because the first version of this model did not have it, and
that produced a bare bicycle whose drag **tripled** by 20° of yaw. It does not.

The measurement engine renders an orthographic silhouette normal to the apparent
wind, so what it reports at yaw *y* is approximately

```
A(y) = A_front·cos(y) + A_side·sin(y)
```

A bicycle has an enormous side profile, so the second term takes over fast.
Measured on this actual model, from 0° to 20°:

| Part | A(0°) | A(20°) | growth |
|---|---|---|---|
| Frame, fork, bars | 0.0675 m² | 0.1396 m² | **2.1×** |
| Wheels | 0.0354 m² | 0.1609 m² | **4.5×** |

The area genuinely grows like that. The drag does not, for two separate reasons.

**(1) The resolution onto the travel axis.** Drag acts along the apparent wind.
What the rider pays for is its component along the direction of travel, a factor
of **cos(y)**. This is exact geometry, not a judgement call, and nothing in the
original model applied it.

**(2) The newly exposed area is not as draggy as the front face was.** The extra
silhouette appearing at yaw is *lengthwise* area — tubes turning broadside,
wheel discs seen obliquely — and it does not develop bluff-body drag in
proportion to its projected area. For a yawed cylinder the **independence
principle** (Hoerner again) gives a normal force set by the velocity component
normal to the axis: force ∝ sin²Λ while projected area ∝ sinΛ, so the
coefficient *referenced to that growing area* falls like sin(Λ). This is the
standard reason tubular frames and deep sections hold or even reduce their drag
at yaw rather than ballooning.

So the silhouette is split into the head-on face still facing the wind and the
lengthwise area newly revealed, the second gets a reduced coefficient σ, and the
total is resolved onto the travel axis. With *r* = A(y)/A(0) for that part:

```
f_head    = min(cos y, r)          still facing the wind
f_side    = max(0, r − cos y)      newly revealed lengthwise area
yawFactor = cos(y) · [f_head + σ·f_side] / r
```

**Every limit is checked in the code's test.** At y = 0 it is exactly 1. At
σ = 1 it is exactly cos(y), so nothing can ever be draggier than a fully bluff
body resolved onto the road — the factor is provably bounded by cos(y) and never
negative. At σ = 0 it is cos²(y)/r. A part that *shrinks* at yaw because
something moved in front of it (r < cos y) takes f_side = 0 and simply keeps its
own coefficient, so an occluded part is never inflated. A part hidden at 0° that
swings into clear air has r → ∞ and tends to cos(y)·σ, which is exactly the
coefficient its newly exposed face deserves.

### 8.3 The σ table

**The magnitudes are engineering judgement.** The ordering is not seriously in
doubt: porous spoked wheels < tubular frame < soft round luggage < flat-sided
luggage < a pannier's slab.

| Part | σ | Reasoning |
|---|---|---|
| `wheels` | 0.10 | Two-thirds of the bare bike's yaw growth is wheels, and a spoked wheel seen obliquely is mostly air — 32 spokes of 1.15 mm radius counted as solid pixels. What disc-like area it gains generates side force, not axial drag. Lowest in the table by a distance. |
| `bike` | 0.25 | Tubes turning broadside. The independence-principle value Cd_n·sin(Λ)/Cd_0 runs 0.11 at 5° to 0.42 at 20°; 0.25 is roughly its yaw-weighted mean, nudged up because not all of the frame's new area is ideal streamwise tube. |
| `rider` | 0.65 | A torso is bluff from any angle and barely grows in silhouette at yaw. |
| `pannier` | 0.95 | A flat slab whose side face is its biggest. When the wind comes at 20° that slab is genuinely presented and genuinely bluff. |
| `trunk`, `randobag` | 0.70 | Boxy and high, side face fully exposed, but shorter than a pannier. |
| `barbag`, `fork` | 0.55 | No shielding out beside the fork legs or ahead of the bars. |
| `framebag_*` | 0.45 | A long smooth panel; flow stays largely attached along it at small incidence. |
| `seatpack`, `saddlebag`, `toptube*` | 0.50 | Swings out of the bike's shadow as yaw opens. |
| `stem`, `downtube` | 0.45 | Small, and partly shielded by bars and front wheel respectively. |
| `barroll` | 0.40 | A cylinder across the wind stays a cylinder at yaw; its silhouette barely changes at all (measured: r = 0.99 at 20°). |
| default | 0.55 | Unclassified slots get the middle of the range. |

### 8.4 What this deliberately does NOT model

Real side force. A wind tunnel resolves axial force from *both* drag and side
force, and for an aerofoil-like section the side force tilts forward and can
drive axial force negative — the sail effect that makes deep-section rims
genuinely faster at some yaw angles. Silhouette area carries no information
about side force whatsoever, so all of it is folded into σ. **σ is therefore an
effective coefficient, not a measured one**, and a part that really does sail
would need a σ below zero, which the model does not allow.

### 8.5 Result

Bare bike, no bags, no rider, against the real measured area curves:

| | 0° | 5° | 10° | 15° | 20° | weighted |
|---|---|---|---|---|---|---|
| Before | 0.1065 | 0.1750 | 0.2274 | 0.2803 | 0.3166 | 0.1924 (**1.81×** head-on) |
| After | 0.0909 | 0.0975 | 0.1031 | 0.1068 | 0.1065 | 0.0987 (**1.09×** head-on) |

It rises 17% out to a peak at 15° and eases back by 20°, which is what a stock
32-spoke shallow-rim wheelset should do. The *fall* beyond 15° that deep aero
wheels show is a sail effect this model cannot produce (§ 8.4); the slight dip
here comes only from the cos(y) resolution finally outrunning the area growth.

And the contrast that makes the feature worth having survives intact — per-part
CdA at 20° relative to each part's own head-on figure:

| Windward pannier | Frame bag | Frame | Bar roll | Stem bag | Leeward pannier |
|---|---|---|---|---|---|
| **2.42×** | 1.78× | 1.11× | 0.90× | 0.84× | 0.41× (occluded) |

Panniers are punished hard at yaw, exactly as they should be. A bar roll —
a cylinder that presents the same face whatever the angle — very slightly
improves.

## 9. The wake discount

What a square metre of luggage costs when it sits in the rig's shadow rather
than in clean air.

### Why this section exists

Running all six modules together produced a full kit measuring **lower** CdA
than the bare bike — the tool reporting that fitting luggage makes you 3 W
faster. The cause was occlusion being treated as mutual replacement: bags
occluded 0.060 m² of rider and frame priced at Cd 0.82–1.00 and replaced it with
bag priced at 0.26–0.71. That is legitimate for a frame bag capping the triangle
(§ 5) and wrong for a bar bag in front of a rider who is still there.

The engine's accounting now fixes the numerator: reserved parts are measured
with bags absent and are never discounted for being shielded. That leaves the
question this section answers — what does a bag in the *baseline's* wake cost?

The old answer was zero. A seat pack behind a rider measured exactly
0.00000 m² of visible area and was reported free. It is not free. It is cheap,
and it is cheap **for a specific reason** that is worth modelling rather than
accidentally reproducing.

### The interface

```js
wakeDiscount(slotKey, yawDeg) -> number in 0..1
```

A multiplier on the Cd charged to the *shadowed* fraction of a bag's silhouette.
The engine measures `exposed` and `wake` areas separately per bag per yaw and
charges `(exposed + wake · wakeDiscount) · Cd · yawFactor`, so this function
prices exactly one physical thing and never has to reason about *which* bag is
shadowed or by how much. 1.0 reproduces the bug; 0.0 reproduces "free".

### What is grounded

A body in a wake sees **reduced dynamic pressure, not zero**. Behind a bluff
body the mean velocity recovers with distance; a seat pack sits close in where
recovery is poor, at roughly u/U ≈ 0.5–0.7, giving q_local/q_∞ ≈ 0.25–0.5. That
much is standard wake mechanics.

Three things push the honest number **up** from there, and they are why these
values sit at the top of that band rather than in its middle:

- Wake turbulence intensity runs 25–35%, and the mean-square velocity that
  actually loads a body sits above the mean velocity squared.
- A body in separated, recirculating flow does not load in proportion to local
  mean q at all — unsteady vortex impingement does work on it.
- **The strongest real calibration available is drafting.** A cyclist tucked
  directly behind another still pays 60–75% of solo drag. That is a large body
  sticking well out of the wake core, so a small fully-immersed bag should be
  cheaper than that — but it bounds how aggressive any discount can be.

### What is judgement

Everything below this line. The tier *ordering* I would defend; the specific
numbers I would not defend to two significant figures.

| Slots | Discount at 0° | Reasoning |
|---|---|---|
| `seatpack`, `saddlebag` | **0.65** | Directly behind the rider's torso, close in, deep in the near wake where the deficit is largest and recovery has barely begun. Set just below the drafting floor rather than at the bottom of the mean-q band. |
| `trunk`, `toptube_rear` | 0.68 | Same shadow, further back and higher, so slightly better recovered. |
| `pannier` | 0.70 | Outboard and low — at the *edge* of the rider's wake rather than in its core, and partly in the rear wheel's. |
| `framebag_*`, `toptube`, `stem`, `downtube`, `fork` | 0.75 | Shadowed only by things that are thin, moving or porous. A frame bag is in the rider's **leg** shadow and the legs are pedalling, so it is in clean air for a good fraction of every stroke. A down tube bag hides behind a rotating spoked wheel, which sheds a far weaker wake than a solid body. Bars, arms and fork blades are thin and their wakes recover fast. |
| `barroll`, `barbag`, `randobag` | 0.80 | Rarely shadowed by anything; the value applies only to whatever slice hides behind bars or a front wheel. |
| default | 0.70 | Middle of the range. |

The spread is narrow — 0.65 to 0.80 — and that is honest. The physics does not
strongly distinguish these cases, and a single constant for every slot would
have been a defensible answer too.

### The yaw ramp

`wakeDiscount` weakens toward 1.0 by 30° of yaw, linearly.

This is **not** the geometric effect of a bag swinging clear of the rider — the
engine already measures that, because `wake` area shrinks and `exposed` area
grows on its own as the angle opens. This is the separate *flow* effect: at yaw
the wake is blown sideways relative to the bike's axis, so a pixel still
geometrically behind the rider sits nearer the shear layer than the wake core,
and is loaded harder. The ramp is a smooth interpolation between two defensible
endpoints. Its shape is my judgement and nothing more.

### Not modelled, deliberately

A bag can also change the drag of the body **shielding** it, by filling the
low-pressure base region behind the rider like a boat-tail. This is the same
class of effect as the frame-bag fairing credit, it is real, and it could be
*negative* — a seat pack partly closing the rider's wake. There is no way to
bound it here, and the engine's rule that reserved parts are never discounted
for being shielded is the right conservative choice. Noted so that a future
measurement knows where to look.

### Result, and the one calibration that does not quite land

A large seat pack (Apidura Expedition 9L, 15 × 16 cm face = 0.024 m²,
100% shadowed head-on):

| | |
|---|---|
| Cd (freestream shape + features) | 0.462 |
| × wake discount at 0° | 0.65 |
| Effective coefficient | 0.30 |
| CdA | 0.0072 m² |
| **Cost at 28 km/h** | **2.1 W** |
| vs a size-matched 9 L bar bag | **0.29** |

### The one calibration deliberately left unmet

**This was decided, not overlooked.** A real-world target was named during
development — that a large seat pack should cost "roughly a third to a half of
an equivalent bar bag". The model produces **0.29**, a shade under a third. It
was left there.

The reasoning, recorded so a future reader sees a deliberate call rather than a
near miss nobody noticed:

- The single knob that would move it is `WAKE_DISCOUNT.seatpack`. Landing
  mid-band needs about **0.74**.
- 0.74 is *above* the drafting floor. It would assert that a small bag fully
  immersed in a rider's wake costs **more** than a whole rider drafting one.
  Neither the author of this table nor the reviewer believed that.
- The drafting figure (60–75% of solo drag, tucked in close) is the only hard
  calibration available on this question. The "third to a half" was a rule of
  thumb offered casually, not a measurement, and was judged not to outrank an
  argument built on the one number that *is* measured.
- 0.29 against a loosely-stated 0.33 is well inside the uncertainty on both.

If a real measurement of seat-pack drag ever lands and contradicts this,
`WAKE_DISCOUNT.seatpack` is the one value to change, and it is a calibration
decision rather than a physics one.

### A consequence that looks like a bug and is not

The re-basing in § 4 means a seat pack's *effective* coefficient when fully
shadowed is 0.30, against the 0.34 it used to carry. It got slightly cheaper,
not more expensive, even though it went from measuring 0.00000 m² to being
charged 2.1 W. Both statements are true: it used to be charged a higher
coefficient on essentially zero area.

## 10. Ride assumptions and the power model

| Input | Value | Source |
|---|---|---|
| Air density | 1.225 kg/m³ | ISA barometric pressure formula plus the ideal gas law, evaluated at 15 °C and sea level. Not a constant in the code — `airDensity()` recomputes it from temperature and altitude, which is a real effect: 2500 m cuts aero drag about 22%. |
| Rider / bike / load | 78 / 11 / 6 kg | Plausible defaults, exposed and adjustable. Mass is identical on both sides of every comparison, so it never contaminates the drag figure. |
| Crr | 0.006 | A 40–45 mm gravel tyre at moderate pressure on smooth tarmac. Public rolling-resistance testing (bicyclerollingresistance.com publishes Crr for specific tyres) puts gravel tyres in roughly the 0.005–0.008 band; **0.006 is my selection from that range**, not a specific tyre's measured figure. |
| Drivetrain efficiency | 97.6% | A clean, well-aligned chain in a middle sprocket. This is the standard figure in the road-cycling power literature (Martin et al.'s validated road-cycling power model uses a chain efficiency in the 97.5–98% band, consistent with Kyle and Berto's drivetrain measurements). |

The power equation itself is not a model choice, it is mechanics:

```
P_pedal = [ ½·ρ·CdA·v³ + Crr·m·g·v + m·g·v·sin(atan(grade)) ] / driveEff
```

One deliberate simplification: the rolling term uses `m·g` where strictly it
should be `m·g·cos(θ)`. On a 10% grade that overstates rolling drag by 0.5%,
an order of magnitude inside the uncertainty on Crr itself, and it keeps the
equation identical to the one printed in the UI's explanation block.

`speedAtPower` inverts this exactly (Newton–Raphson on the cubic, converging in
four iterations at realistic inputs, with a bisection fallback). Round-tripping
`power` → `speedAtPower` returns the input speed to machine precision.

## 11. Calibration check

Anchors, and what this table produces against a plausible marginal frontal area.

Anchors, and what this table produces against a plausible marginal frontal area.
The areas are estimates standing in for what `measure.js` will report; the
coefficients are the shipped ones.

Areas marked **(measured)** come from `tools/aero-check.mjs` running the real
engine on the real geometry. The rider's area is still an estimate — the
measured runs are rider-off.

| Anchor | Target CdA | This table | |
|---|---|---|---|
| Bare bike, no rider | ~0.09 m² | 0.90 × 0.0675 + 0.85 × 0.0354 = **0.0909** *(measured)* | ✓ |
| Bike + rider on hoods | ~0.36 m² | + 0.82 × 0.330 = **0.361** | ✓ |
| Large handlebar roll | +0.02–0.03 m² | 0.50 × 0.0595 = **+0.030** *(measured)* | ✓ (top of range) |
| Loaded panniers (pair) | ~+0.06 m² | 1.05 × 0.0551 = **+0.058** *(measured)* | ✓ |
| Full frame bag | ~0, within noise | 0.25 × 0.0090 − 0.002 = **+0.0003** *(measured)* | ✓ |

All five now close against real measured areas, the frame bag included: its own
cost came out at +0.00225 m², the flow credit takes −0.002, and the net is
+0.0003 m² — neutral to three decimal places. That is a better agreement than
the model deserves and should not be over-read; it is one product on one frame.

**One piece is still unmeasured.** The figure above is the bag's own cost plus
the flow credit. It does *not* include the occlusion area swap (§ 5 half (a)),
which the pipeline applies on top and which pushes the net slightly negative.
The bike part measures 0.0675 m² bare and 0.0502 m² under a full kit, so the
swap is worth up to −0.017 m² of area — but that is *all* the bags occluding the
frame at once, not the frame bag alone, and isolating it needs a measurement
nobody has run yet. The four-number diagnostic in § 5 is still the way to settle
it.

Headline figures at 28 km/h, from measured areas against the CdA 0.36 bike +
rider anchor:

| Rig | CdA | Added | At equal effort | Per 100 km | Grade |
|---|---|---|---|---|---|
| Bikepacking (bar roll, frame bag, seat pack, 2 stem, 2 fork) | 0.36 → 0.43 | **+19 W** | −1.35 km/h | +11 min | C "Draggy" |
| Everything, panniers included | 0.36 → 0.48 | **+37 W** | −2.33 km/h | +20 min | E "Billboard" |

Panniers are the expensive choice and everything else on a bikepacking bike is
comparatively cheap — and that gap widens further in crosswind, which is what
§ 8 exists to capture.

Caveat on both rows: the bag areas are measured with the rider off, and a rider
would occlude some of what those bags currently show. Treat them as a mild
upper bound.

## 12. What would improve this document

An actual measurement. If a wind-tunnel dataset for bikepacking luggage surfaces
— Tour magazine has run luggage tests in the past, and manufacturers
occasionally publish — the base table in §4 should be recalibrated against it
and this section deleted. Until then every value marked *judgement* above stays
marked.
