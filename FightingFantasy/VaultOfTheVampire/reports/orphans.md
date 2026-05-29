# Vault of the Vampire — orphan reconciliation

_Generated 2026-05-29 by `npm run report:orphans`. Read-only; no data was changed._

**8** sections are unreachable from §1, in **6** islands (connected components). Each island needs only ONE inbound link recovered — its **entry orphan** (zero inbound). Fixing that reconnects every member.

Every "turn to N" phrase in the book already resolves to a valid number and `scannerFoundUnstored = 0`, so these inbound links were corrupted by **digit substitution** into other valid sections — there is no leftover garbled token to grep. The candidate tables below list reachable sources whose stored choice is one OCR digit-confusion away from the orphan ("§src → §C, where §C may be a misread of the orphan"). Confirm against the source PDF before rewriting any link.

## Islands

### Island 1 — sections §94, §328, §374

**Entry orphan §94** (page 37)
> 'You have the Book,' the apparition says approvingly. 'My sword is imprisoned within it, Reiner's magic used blood to put it there, and blood is needed to free it again.' Siegfried points to an ornate silver chalice on t

| source | currently points to | confusion weight |
| ---: | ---: | ---: |
| §43 | §91 (may be a misread of §94) | 1 |
| §50 | §99 (may be a misread of §94) | 1 |
| §330 | §44 (may be a misread of §94) | 1 |

### Island 2 — sections §169

**Entry orphan §169** (page 58)
> You find the jar and rush back with it to Karl-Heinz the Alchemist. "Wonderful," he says, grabbing it with glee. 'The final ingredient for my potion of longevity! I'll soon be young again, And I have your potion ready to

| source | currently points to | confusion weight |
| ---: | ---: | ---: |
| §229 | §189 (may be a misread of §169) | 3 |
| §22 | §109 (may be a misread of §169) | 2 |
| §30 | §159 (may be a misread of §169) | 2 |
| §70 | §159 (may be a misread of §169) | 2 |
| §93 | §109 (may be a misread of §169) | 2 |
| §102 | §160 (may be a misread of §169) | 2 |
| §29 | §164 (may be a misread of §169) | 1 |
| §106 | §164 (may be a misread of §169) | 1 |

### Island 3 — sections §188

**Entry orphan §188** (page 63)
> Gunthar stares intently at the book with the magical page. 'But this is Siegfried's sword!' he says in amazement, looking at the page. 'Some great sor- cery has imprisoned it within this book!' Then he becomes unhappy an

| source | currently points to | confusion weight |
| ---: | ---: | ---: |
| §36 | §183 (may be a misread of §188) | 3 |
| §40 | §138 (may be a misread of §188) | 3 |
| §61 | §108 (may be a misread of §188) | 3 |
| §82 | §108 (may be a misread of §188) | 3 |
| §85 | §186 (may be a misread of §188) | 3 |
| §113 | §138 (may be a misread of §188) | 3 |
| §114 | §168 (may be a misread of §188) | 3 |
| §122 | §180 (may be a misread of §188) | 3 |

### Island 4 — sections §350

**Entry orphan §350** (page 101)
> You whisper Siegfried's name and the chest springs open. Inside is a suit of magnificent, gleaming silvered chainmail! Eagerly, you strip off your own leather armour and don this superior protection; its seeming weightle

| source | currently points to | confusion weight |
| ---: | ---: | ---: |
| §113 | §358 (may be a misread of §350) | 3 |
| §78 | §360 (may be a misread of §350) | 2 |
| §133 | §380 (may be a misread of §350) | 2 |
| §157 | §359 (may be a misread of §350) | 2 |
| §161 | §356 (may be a misread of §350) | 2 |
| §210 | §359 (may be a misread of §350) | 2 |
| §233 | §380 (may be a misread of §350) | 2 |
| §252 | §330 (may be a misread of §350) | 2 |

### Island 5 — sections §376

**Entry orphan §376** (page 109)
> Katarina looks at the book you are carrying. 'Perhaps I can help after all,' she says as she takes it from you and opens it. She gives a sharp intake of breath when she reaches the magical page. 'This is Siegfried's swor

| source | currently points to | confusion weight |
| ---: | ---: | ---: |
| §44 | §316 (may be a misread of §376) | 3 |
| §200 | §316 (may be a misread of §376) | 3 |
| §252 | §316 (may be a misread of §376) | 3 |
| §290 | §316 (may be a misread of §376) | 3 |
| §48 | §375 (may be a misread of §376) | 2 |
| §272 | §370 (may be a misread of §376) | 2 |
| §317 | §375 (may be a misread of §376) | 2 |
| §50 | §326 (may be a misread of §376) | 1 |

### Island 6 — sections §378

**Entry orphan §378** (page 110)
> You enter a library lit by a golden globe of soft magica] light, hanging in the air. There are hun- dreds of books on the bookshelves, but one particu- lar shelf is full of works concerned with the history of Mortvania a

| source | currently points to | confusion weight |
| ---: | ---: | ---: |
| §79 | §373 (may be a misread of §378) | 3 |
| §118 | §373 (may be a misread of §378) | 3 |
| §205 | §318 (may be a misread of §378) | 3 |
| §205 | §373 (may be a misread of §378) | 3 |
| §251 | §373 (may be a misread of §378) | 3 |
| §272 | §370 (may be a misread of §378) | 3 |
| §318 | §373 (may be a misread of §378) | 3 |
| §48 | §375 (may be a misread of §378) | 2 |

## Gate hubs (orphans may be intentional)

These sections route the player onward by a mechanism the choice graph can't follow (cipher answers, "turn to the paragraph matching the number on the key", etc.). An orphan that is the target of one of these is **orphaned by design** and needs no link fix — e.g. §350 (silvered chainmail) is the answer to the §123 cipher. Cross-check orphans against these.

| section | page | text |
| ---: | ---: | --- |
| §35 | 20 | "You possess all that is needed to destroy Reiner in his coffin,' says the ghost softly, 'but can you fight him?' Do you have-the Book of Swords? If you do turn to that paragraph which is half the num |
| §48 | 24 | Gunthar looks nervous. He says that any magic he might use to help you would alert Katarina, which could be very dangerous... he is clearly reluctant. Do you have the Book of Healers? If you do, turn  |
| §123 | 46 | There is a group of obscure runes on the plaque you manage to decode them into letters, but they don't make sense, You puess that they have to spell out sore phrase, hidden within these let- ters, to  |
| §220 | 70 | 'You have the cross, but you lack the weapon to destroy Reiner,' says Siegfried grimly. Do you have the Book of Swords? If you have it, turn to that paragraph which is one half the number of the magic |
| §282 | 87 | The kitchen contains some good food -- bread, bis- cuits, cheese, sweet dried fruits and so on. You can gather plentiful supplies here (add 6 to your Provi- sions). Now, are you searching for herbs fo |
| §317 | 94 | If you have the Book of Healers, you decide to show this to Gunthar. If you have an Affliction, Gunthar will help you with this m return for getting the book back, so turn to 375. If you don't have an |
| §332 | 97 | This door has a small silvered lock. Do you have a Silver Key? If you have, tum to the paragraph whose number is the same as the number on the key. If you haven't, you can't open this door. You can ei |
| §375 | 109 | You give the Book of Healers to Gunthar, who is delighted to have it back. Reiner stole it some months ago, and Gunthar has not been able to find it without the Count's spies - his rats and bats - fol |
| §378 | 110 | You enter a library lit by a golden globe of soft magica] light, hanging in the air. There are hun- dreds of books on the bookshelves, but one particu- lar shelf is full of works concerned with the hi |
| §399 | 114 | 'Excellent,' purrs the saturnine lady. 'When he is dead, I shall rule here as Countess!' Do you have the Book of Swords? If you do, and you wish to show this to Katarina, turn to the paragraph which i |

## Fragile targets (potential hidden orphans)

A **speculative watch list**: each section below is currently reachable only via inbound link(s) that are also strong (weight ≥ 2) candidate-corrections for an orphan above. *If* such a link is confirmed and redirected, the section becomes a new orphan (the §272→378 cascade). This over-reports — many links here are legitimate and merely happen to fit a confusion pattern. **Authoritative method:** apply the PDF-confirmed fixes, then re-run this report; genuine new orphans surface as real (zero-inbound) entries.

| section | page | sole/all inbound from | text |
| ---: | ---: | --- | --- |
| §168 | 58 | §114 | Having overcome the guardian here, you snatch up a couple of silvered crystal birds which are small enough to carry. These are worth 3 Gold Pieces for the pair  |
| §180 | 61 | §122 | Wiping the last of the slime from the Stench Ghoul off your sword, you take a quick look around and find a leather bag in the sarcophagus. This contains 5 Gold  |
| §183 | 61 | §36 | Karl-Heinz refuses your offer. "You don't get basi- lisk livers and squid ink for nothing, you know. I've got costs to cover,' he laments. He looks thoughtful t |
| §186 | 62 | §85 | The bat's vicious bite strikes home on your already injured neck, and the hateful flapping menace rips your jugular open. You collapse in agony as your life's b |
| §189 | 63 | §229 | Do you have a Crucifix and/or the Shield of FAITH? If you have at least one of these items, turn to 220. If you have neither, turn to 259 |
| §316 | 94 | §44, §200, §252, §290 | You ascend the narrow, steeply sloping wooden stairs until you come to a landing before a wooden door which is barred and decorated with warding glyphs of amber |
| §318 | 94 | §205 | The Alchemist says he will prepare a potion for you which will be of help, but he wants 8 Gold Pieces for the cost of the ingredients (coins, or other Treasure  |
| §358 | 104 | §113 | You enter the hut and search around. In the Gnome's bedroom you find a portrait of a dark and cadaverous, but undoubtedly handsome man, his black hair brushed b |
| §370 | 107 | §272 | You roll over the edge of a precipice, and your body is smashed to pieces on the rocks in the chasm below. You have failed most miserably in your quest! |
| §373 | 108 | §79, §118, §205, §251, §318 | F. Die: re Me . i 373 Back in the corridor, you can open a door on the west side, opposite the Alchemist's room, if you haven't done so before (turn to 240) or  |
