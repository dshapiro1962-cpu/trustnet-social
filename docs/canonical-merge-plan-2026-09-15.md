# Canonical merge plan · 15 Sep 2026

> **Applied 15 Sep.** 181 -> 161 live canonicals, 14 tombstones,
> 194 -> 179 recommendations, 18 -> 1 collision groups.
>
> The one remaining group, `ROK`, is **closed and stays unfolded**: Khorazim
> Street is in Givatayim, not Ramat Gan, and dan has ruled it unimportant.

Generated, not hand-written. Nothing has been written to the database.

```
PROPOSED MERGES — 14 groups, 15 rows folded

  "agia marina"   (identical)
    KEEP  b5e90496-903f-4e65-a0a0-4a65251e786e  Leros  |  beach  |  recs=2 resp=1 emb
    fold  c399c175-e5bf-4e20-8744-79884257a410  Leros  |  beach  |  recs=1 resp=0 emb

  "alinda"   (identical)
    KEEP  9666d3d8-afc1-458d-a51f-93f4bed9b3ef  Leros  |  beach  |  recs=3 resp=0 emb
    fold  2c25cf22-755a-48c4-aa7e-9a3101fee964  Leros  |  beach  |  recs=1 resp=2 emb

  "avoriaz 1800"   (identical)
    KEEP  d91c4eb8-7f41-4a02-807d-3beed5aa4846  Haute-Savoie, France  |  ski resort  |  recs=2 resp=0 emb
    fold  b8ac816a-b75a-4fc4-9337-bbf42be3f8c9  Haute-Savoie, France  |  ski resort  |  recs=1 resp=0 emb

  "mylos by the sea"   (identical)
    KEEP  fa62f220-0d16-4b06-b5f9-ffdaa146a2e8  Leros  |  seafood restaurant  |  recs=2 resp=0 emb
    fold  9e66b2da-ab22-4a1d-bc01-38122b3e70d2  leros  |  restaurant  |  recs=0 resp=0 emb

  "the castel above panteli"   (identical)
    KEEP  a1049909-2188-4bef-844e-5a5e945f91f0  Leros  |  sightseeing spot  |  recs=1 resp=0 emb
    fold  f1918f8d-1cec-4d93-9d5b-921bb9a29731  Leros  |  sightseeing spot  |  recs=0 resp=1 emb

  "the cherry orchard"   (one is blank)
    KEEP  e0221e09-e2d7-4d7a-99a4-cfc461cd0f40  (no loc)  |  play  |  recs=1 resp=0 emb
    fold  98ec3c45-aaab-4424-ba0d-cfc3d33bcee2  (no loc)  |  play  |  recs=0 resp=1 emb

  "the israel museum"   (identical)
    KEEP  3b197ffa-32bd-4627-b709-306dde988f2d  Israel  |  museum  |  recs=1 resp=0 emb
    fold  30be9a83-56e2-4c32-a2c0-0b63943c76e8  Israel  |  museum  |  recs=0 resp=0 emb

  "tony vespa"   (identical)
    KEEP  68058b24-f55c-4118-b22c-a433a632ce32  Indianapolis, United States  |  founder of technology consulting firm  |  recs=2 resp=0 emb
    fold  add27637-a9b2-4dd7-bd31-9b9d1404567f  Indianapolis, United States  |  founder  |  recs=1 resp=0 emb
    fold  3ffe2766-6e43-4923-9e68-e0db1d5a23c5  Indianapolis, United States  |  technology consultant  |  recs=1 resp=0 emb

  "war and peace"   (one is blank)
    KEEP  c0c657ce-9d68-4da8-aa84-d265acbb352a  (no loc)  |  novel  |  recs=1 resp=0 emb
    fold  5afe1cf3-95ba-4563-8020-e758bc9769c7  (no loc)  |  novel  |  recs=0 resp=1 emb

  "yes in shevach street 34 tel aviv"   (one contains the other)
    KEEP  701a0deb-66a4-426d-b6d1-169ea2844c7e  Tel Aviv, Israel  |  (no kind)  |  recs=1 resp=0 emb
    fold  e47b14a3-bfc5-4840-ba80-c9d1e925a07b  Tel Aviv  |  (no kind)  |  recs=1 resp=1 emb

  "אבו חסן"   (one contains the other)
    KEEP  793e9278-f440-42b3-b7de-bbc76a7f3af9  תל אביב-יפו, ישראל  |  מסעדת חומוס hummus restaurant  |  recs=1 resp=0 emb
    fold  dd71a309-dc7f-4da4-a9e4-d7aa9deb39cf  יפו  |  (no kind)  |  recs=0 resp=1

  "בית ספר אלחריזי"   (identical)
    KEEP  47f7c7a1-2256-4ce7-9731-71c562535a06  Tel Aviv  |  (no kind)  |  recs=1 resp=1 emb
    fold  05fb445e-ac4a-4348-b381-9b041287322b  Tel Aviv  |  (no kind)  |  recs=1 resp=0 emb

  "רומן טמיר"   (one contains the other)
    KEEP  26de7a71-ba7b-49d5-97dc-ef82fee8338b  גבעתיים  |  רופא עור dermatologist  |  recs=2 resp=0 emb
    fold  ffff180e-147e-42fa-b6bb-ade823851b96  גבעתיים, ישראל  |  (no kind)  |  recs=1 resp=0 emb

  "שושן שמוליק"   (identical)
    KEEP  50de4871-25c1-424f-9bb0-19dfd7f72e3b  גאולה  |  (no kind)  |  recs=3 resp=0 emb
    fold  d3a8dfd0-fd86-4d3b-8aff-06ccafba1410  גאולה  |  (no kind)  |  recs=1 resp=0 emb


EMPTY ROWS — 3 with no location, no kind, nothing pointing at them

    4221de19-840c-412f-b4ea-9cd4c6275e26  "art pizza"
    81babc34-3e97-447d-8e34-79b7ed0405cf  "k2"
    e7d4e878-f4b5-4766-a13a-8b145ba53b13  "Tony vespa"


NEEDS A HUMAN — 3 groups where the locations are not compatible

  "air b b"
    26f56dd6-bd69-49bb-8a40-7185c241c694  Bari Italy                    accommodation                         recs=1
    2200f590-3529-4e25-9c34-a4863473e6c7  Apulia, Italy                 accommodation platform                recs=1

  "rok"
    d2f2441a-36b2-4234-9919-20191c00608e  רמת גן, ישראל                 (no kind)                             recs=1
    4b5fe7fc-2add-4ffa-a053-575f0ffd71be  רחוב כורזים 5                 (no kind)                             recs=3

  "tony vespa"
    68058b24-f55c-4118-b22c-a433a632ce32  Indianapolis, United States   founder of technology consulting firm recs=2
    add27637-a9b2-4dd7-bd31-9b9d1404567f  Indianapolis, United States   founder                               recs=1
    3ffe2766-6e43-4923-9e68-e0db1d5a23c5  Indianapolis, United States   technology consultant                 recs=1
    60d16017-96be-44a7-99b2-e94203b71429  tel aviv                      (no kind)                             recs=1

```
