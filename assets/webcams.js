const RESORTS = [
  {
    id: "deer-valley",
    name: "Deer Valley",
    area: "Park City",
    source: "https://www.deervalley.com/explore-the-mountain/webcams",
    cams: [
      {
        name: "Snow Park Lodge",
        embed: "https://www.youtube-nocookie.com/embed/QozKoFs-hL0?autoplay=1&mute=1&playsinline=1&rel=0",
        publisherEmbed:
          "https://camstreamer.com/embed/M5ToybhwNTDP6Y5Yt6lIr9hylOONXTv892poZIyH?autoplay=1&mute=1",
      },
      {
        name: "Silver Lake Lodge",
        embed: "https://www.youtube-nocookie.com/embed/uE_ent5rC3Y?autoplay=1&mute=1&playsinline=1&rel=0",
        publisherEmbed:
          "https://camstreamer.com/embed/oCzfMDDSJHRGJXfQug4D8FhLpuU7GwaphZjuO00Z?autoplay=1&mute=1",
      },
      {
        name: "Empire Express",
        embed: "https://www.youtube-nocookie.com/embed/r8qiPv9XCOM?autoplay=1&mute=1&playsinline=1&rel=0",
        publisherEmbed:
          "https://camstreamer.com/embed/5JJMkCuxzOl52j8pMT9Fc6wNrJkeVLlPl75l2nPD?autoplay=1&mute=1",
      },
      {
        name: "Sterling Express",
        embed: "https://www.youtube-nocookie.com/embed/iNdfTLilLlU?autoplay=1&mute=1&playsinline=1&rel=0",
        publisherEmbed:
          "https://camstreamer.com/embed/85gYTybAhS5pjj2NpJ6n93R4VQwgn6aLdHWhpFDx?autoplay=1&mute=1",
      },
      {
        name: "Galena Express",
        embed: "https://www.youtube-nocookie.com/embed/0shWeR7Fvpg?autoplay=1&mute=1&playsinline=1&rel=0",
        publisherEmbed:
          "https://camstreamer.com/embed/lgOzg0AxWR6BOLOBlZnaN7hhB6RnEOUaaWErbdxH?autoplay=1&mute=1",
      },
      {
        name: "Revelator Express",
        embed: "https://www.youtube-nocookie.com/embed/XZjubaPbamE?autoplay=1&mute=1&playsinline=1&rel=0",
        publisherEmbed:
          "https://camstreamer.com/embed/cgVMhgI2Dht1tLyFW28p4r4uoCgka4wGNgL3npJ0?autoplay=1&mute=1",
      },
      {
        name: "Sultan Express",
        embed: "https://www.youtube-nocookie.com/embed/sAjdqw-lzgI?autoplay=1&mute=1&playsinline=1&rel=0",
        publisherEmbed:
          "https://camstreamer.com/embed/WHHs0IGromJCpEcQUtsBvCiYCOQfueb4CM5nq6XC?autoplay=1&mute=1",
      },
    ],
    region: "utah",
    forecast: "deer-valley",
  },
  {
    id: "park-city",
    name: "Park City Mountain",
    area: "Park City",
    source: "https://www.parkcitymountain.com/the-mountain/mountain-conditions/mountain-cams.aspx",
    cams: [
      { name: "Mountain Village", embed: "https://player.brownrice.com/embed/parkcitymtnvillage" },
      { name: "Top of Crescent", embed: "https://player.brownrice.com/embed/parkcitytopcrescent" },
      { name: "Crescent Ridge", embed: "https://player.brownrice.com/embed/parkcitycrescentridge" },
    ],
    region: "utah",
    forecast: "park-city",
  },
  {
    id: "canyons-resort",
    name: "Canyons Resort",
    area: "Park City",
    source: "https://www.parkcitymountain.com/the-mountain/mountain-conditions/mountain-cams.aspx",
    cams: [
      { name: "Canyons Village Ski Beach", embed: "https://player.brownrice.com/embed/parkcitycnskibeach" },
      { name: "Lookout Cabin", embed: "https://player.brownrice.com/embed/parkcitylookoutcabin" },
      { name: "High Meadow", embed: "https://player.brownrice.com/embed/parkcityhighmeadow" },
      { name: "Top of Orange Bubble Express", embed: "https://player.brownrice.com/embed/parkcitytopobx" },
    ],
    region: "utah",
    forecast: "canyons-resort",
  },
  {
    id: "alta",
    name: "Alta",
    area: "Little Cottonwood",
    source: "https://www.alta.com/weather#mountain-cams",
    cams: [
      {
        name: "Albion Basin",
        snapshot: "https://app.prismcam.com/public/helpers/realtime_preview.php?c=65&s=720",
      },
      {
        name: "Mount Baldy",
        snapshot: "https://app.prismcam.com/public/helpers/realtime_preview.php?c=88&s=720",
      },
      {
        name: "Snow Stake",
        snapshot: "https://alta-webcams.sfo3.cdn.digitaloceanspaces.com/Collins_Snow_Stake.jpg",
      },
      {
        name: "Mount Superior",
        snapshot: "https://alta-webcams.sfo3.cdn.digitaloceanspaces.com/Superior.jpg",
      },
      {
        name: "High Rustler",
        snapshot: "https://alta-webcams.sfo3.cdn.digitaloceanspaces.com/Highrustler.jpg",
      },
      {
        name: "Sugarloaf Peak",
        snapshot: "https://alta-webcams.sfo3.cdn.digitaloceanspaces.com/sugar_peak.jpg",
      },
      { name: "East Greeley", snapshot: "https://alta-webcams.sfo3.cdn.digitaloceanspaces.com/Greeley.jpg" },
      {
        name: "Salt Lake Valley",
        snapshot: "https://alta-webcams.sfo3.cdn.digitaloceanspaces.com/collins_dtc.jpg",
      },
    ],
    region: "utah",
    forecast: "alta",
  },
  {
    id: "snowbird",
    name: "Snowbird",
    area: "Little Cottonwood",
    source: "https://www.snowbird.com/the-mountain/webcams/view-all-webcams/",
    cams: [
      {
        name: "Snowstake",
        snapshot: "https://b15.hdrelay.com/camera/8611e276-7ee5-42c0-b8cd-d9e1890e1cd4/snapshot",
        hls: "https://b15.hdrelay.com/camera/8611e276-7ee5-42c0-b8cd-d9e1890e1cd4/relay/playlist.m3u8",
      },
      {
        name: "Peruvian Gulch",
        snapshot: "https://b15.hdrelay.com/camera/544432bd-3910-4888-aa9f-14b6f51a7eb5/snapshot",
        hls: "https://b15.hdrelay.com/camera/544432bd-3910-4888-aa9f-14b6f51a7eb5/relay/playlist.m3u8",
      },
      {
        name: "Mineral Basin",
        snapshot: "https://b15.hdrelay.com/camera/5780754f-8da1-4223-ab8a-6755d84cbc10/snapshot",
        hls: "https://b15.hdrelay.com/camera/5780754f-8da1-4223-ab8a-6755d84cbc10/relay/playlist.m3u8",
      },
      {
        name: "Little Cloud",
        snapshot: "https://b15.hdrelay.com/camera/db2a69c5-66e9-4c48-a713-919eaf191fc1/snapshot",
        hls: "https://b15.hdrelay.com/camera/db2a69c5-66e9-4c48-a713-919eaf191fc1/relay/playlist.m3u8",
      },
      {
        name: "Tram Bullpen",
        snapshot: "https://b15.hdrelay.com/camera/61b2490be101c00b9c48374f/snapshot",
        hls: "https://b15.hdrelay.com/camera/61b2490be101c00b9c48374f/relay/playlist.m3u8",
      },
      {
        name: "Hidden Peak",
        snapshot: "https://backend.roundshot.com/cams/44cfff4ff2a218a1178dbb105d95846a/medium",
      },
      {
        name: "Powder Paradise",
        snapshot: "https://backend.roundshot.com/cams/48fc223c0ed88474ecc2f884bf39de63/medium",
      },
      {
        name: "Hidden Peak 360",
        snapshot: "https://backend.roundshot.com/cams/09123258cc29cd6e86d3af9a3836c150/optional",
      },
    ],
    region: "utah",
    forecast: "snowbird",
  },
  {
    id: "solitude",
    name: "Solitude",
    area: "Big Cottonwood",
    source: "https://www.solitudemountain.com/mountain-and-village/webcams",
    cams: [
      {
        name: "Honeycomb Canyon",
        embed: "https://www.youtube-nocookie.com/embed/gfHReYIuydU?autoplay=1&mute=1&playsinline=1&rel=0",
      },
      {
        name: "Powderhorn",
        embed: "https://www.youtube-nocookie.com/embed/fKLVbvQhPsc?autoplay=1&mute=1&playsinline=1&rel=0",
        offline: true,
      },
      {
        name: "Sunshine Bowl",
        embed: "https://www.youtube-nocookie.com/embed/Lnznapxh2xM?autoplay=1&mute=1&playsinline=1&rel=0",
      },
      {
        name: "Snow Stake",
        embed: "https://www.youtube-nocookie.com/embed/QCqYmOGzULs?autoplay=1&mute=1&playsinline=1&rel=0",
      },
      {
        name: "Moonbeam Parking Lot",
        embed: "https://www.youtube-nocookie.com/embed/ta-4QZbfMXc?autoplay=1&mute=1&playsinline=1&rel=0",
      },
      {
        name: "Moonbeam Express Lift Line",
        embed: "https://www.youtube-nocookie.com/embed/NSiItCGabfo?autoplay=1&mute=1&playsinline=1&rel=0",
      },
      {
        name: "Apex Express & Sunrise",
        embed: "https://www.youtube-nocookie.com/embed/l2X9DlRzX54?autoplay=1&mute=1&playsinline=1&rel=0",
      },
      {
        name: "Summit Express Lift Line",
        embed: "https://www.youtube-nocookie.com/embed/rUXoOLxKKX4?autoplay=1&mute=1&playsinline=1&rel=0",
      },
      {
        name: "Powderhorn II Lift Line",
        embed: "https://www.youtube-nocookie.com/embed/yeoBog_kSzc?autoplay=1&mute=1&playsinline=1&rel=0",
      },
      {
        name: "Link Lift Line",
        embed: "https://www.youtube-nocookie.com/embed/Yx3QmuKfwjY?autoplay=1&mute=1&playsinline=1&rel=0",
      },
    ],
    region: "utah",
    forecast: "solitude",
  },
  {
    id: "brighton",
    name: "Brighton",
    area: "Big Cottonwood",
    source: "https://www.brightonresort.com/conditions",
    cams: [
      {
        name: "Top of Crest 6",
        embed: "https://www.youtube-nocookie.com/embed/Zv8HYwaXjBg?autoplay=1&mute=1&playsinline=1&rel=0",
      },
      {
        name: "Molly Green’s",
        embed: "https://www.youtube-nocookie.com/embed/uZ24vqOWEkQ?autoplay=1&mute=1&playsinline=1&rel=0",
      },
      {
        name: "Parking Lot",
        embed: "https://www.youtube-nocookie.com/embed/4a-3iEM7bHk?autoplay=1&mute=1&playsinline=1&rel=0",
      },
      {
        name: "Explorer Lift",
        embed: "https://www.youtube-nocookie.com/embed/vMwQRjlfqtA?autoplay=1&mute=1&playsinline=1&rel=0",
      },
    ],
    region: "utah",
    forecast: "brighton",
  },
  {
    id: "snowbasin",
    name: "Snowbasin",
    area: "Ogden Valley",
    source: "https://www.snowbasin.com/the-mountain/web-cams/",
    cams: [
      {
        name: "Snowstake Cam",
        snapshot: "https://b15.hdrelay.com/camera/09f922af-169d-4949-9bb7-295c6a859daa/snapshot",
        hls: "https://b15.hdrelay.com/camera/09f922af-169d-4949-9bb7-295c6a859daa/relay/playlist.m3u8",
      },
      {
        name: "Earl's Plaza",
        snapshot: "https://b15.hdrelay.com/camera/6192dd615233cdcad76d7dba/snapshot",
        relay: "6192dda05233cdcad76d7dbb",
        hls: "https://b15.hdrelay.com/camera/6192dd615233cdcad76d7dba/relay/playlist.m3u8",
      },
      {
        name: "Needles",
        snapshot: "https://b15.hdrelay.com/camera/1b6ed87c-f919-4e59-b9cc-7480e3ca31c3/snapshot",
        relay: "5af99fc0-02f8-4dc2-8e9a-ba20ad3093c5",
        hls: "https://b15.hdrelay.com/camera/1b6ed87c-f919-4e59-b9cc-7480e3ca31c3/relay/playlist.m3u8",
      },
      {
        name: "Strawberry Patio",
        snapshot: "https://b15.hdrelay.com/camera/65652b36eb0e282336694064/snapshot",
        relay: "65652b917efa88233092a64d",
        hls: "https://b15.hdrelay.com/camera/65652b36eb0e282336694064/relay/playlist.m3u8",
      },
      {
        name: "Base Area",
        snapshot: "https://b15.hdrelay.com/camera/621944828db58d080b9eac8b/snapshot",
        relay: "621944fbaaab8d0820944246",
        hls: "https://b15.hdrelay.com/camera/621944828db58d080b9eac8b/relay/playlist.m3u8",
      },
      {
        name: "Middle Bowl Base",
        snapshot: "https://b15.hdrelay.com/camera/62101a0b8db58d080b9eac83/snapshot",
        relay: "62101bfb8db58d080b9eac84",
        hls: "https://b15.hdrelay.com/camera/62101a0b8db58d080b9eac83/relay/playlist.m3u8",
      },
      {
        name: "Base of Wildcat",
        snapshot: "https://b15.hdrelay.com/camera/61e1c2e0faf0bf0b5629ac59/snapshot",
        relay: "61e1c348e73e870b5583f203",
        hls: "https://b15.hdrelay.com/camera/61e1c2e0faf0bf0b5629ac59/relay/playlist.m3u8",
      },
    ],
    region: "utah",
    forecast: "snowbasin",
  },
  {
    id: "killington",
    name: "Killington",
    area: "Central Vermont",
    forecast: "",
    source: "https://www.killington.com/webcams",
    cams: [
      {
        name: "North Ridge",
        snapshot: "https://b15.hdrelay.com/camera/61e3ce02-faaa-4499-a547-6574ef6fa4f6/snapshot",
        hls: "https://b15.hdrelay.com/camera/61e3ce02-faaa-4499-a547-6574ef6fa4f6/relay/playlist.m3u8",
      },
      {
        name: "K-1 Lodge 360°",
        badge: "360° PANORAMA · STILL",
        snapshot: "https://backend.roundshot.com/cams/f2572122787963021c4ad2d728d69701/medium",
      },
      {
        name: "Superstar",
        snapshot: "https://b15.hdrelay.com/camera/a0de9878-d7b7-4906-9e83-536fde35c8a9/snapshot",
        hls: "https://b15.hdrelay.com/camera/a0de9878-d7b7-4906-9e83-536fde35c8a9/relay/playlist.m3u8",
      },
      {
        name: "Snowshed",
        embed:
          "https://watch.hdrelay.io/player.html?cam=cam_snowshed_adventure_center_1789055086968&profile=p_mu553zjlpb6h&sig=2c04103571174c7fdc01ea75&exp=1821162100777&dom=",
      },
      {
        name: "Bear Mountain",
        snapshot: "https://b15.hdrelay.com/camera/48933086-3e4f-4093-818f-603f6d084c81/snapshot",
        hls: "https://b15.hdrelay.com/camera/48933086-3e4f-4093-818f-603f6d084c81/relay/playlist.m3u8",
      },
      {
        name: "Golf Course Clubhouse",
        snapshot: "https://b15.hdrelay.com/camera/5f4fb731-c591-464f-a60d-dccc968e8fa0/snapshot",
        hls: "https://b15.hdrelay.com/camera/5f4fb731-c591-464f-a60d-dccc968e8fa0/relay/playlist.m3u8",
      },
    ],
    region: "ne",
  },
  {
    id: "stratton",
    name: "Stratton",
    area: "Southern Vermont",
    forecast: "stratton-mountain",
    source: "https://www.stratton.com/the-mountain/webcams",
    cams: [
      {
        name: "Summit",
        embed: "https://www.youtube-nocookie.com/embed/9E00W9R_Cnc?autoplay=1&mute=1&playsinline=1&rel=0",
      },
      {
        name: "Snow Bowl",
        embed: "https://www.youtube-nocookie.com/embed/ildHe_RG1Mk?autoplay=1&mute=1&playsinline=1&rel=0",
      },
      {
        name: "Mid-Mountain Lodge",
        embed: "https://camstreamer.com/embed/6d876e50aed9a9f/S-10051?autoplay=1&mute=1",
      },
      {
        name: "Base Lodge",
        embed: "https://camstreamer.com/embed/70ccf46040b5642/S-19241?autoplay=1&mute=1",
      },
      {
        name: "Tube Park",
        embed: "https://www.youtube-nocookie.com/embed/ju7zEm_gql0?autoplay=1&mute=1&playsinline=1&rel=0",
      },
      {
        name: "Golf Course",
        embed: "https://camstreamer.com/embed/51a3cf116dea6bf/S-61347?autoplay=1&mute=1",
      },
    ],
    region: "ne",
  },
  {
    id: "stowe",
    name: "Stowe",
    area: "Northern Vermont",
    forecast: "stowe",
    source: "https://www.stowe.com/the-mountain/mountain-conditions/mountain-cams.aspx",
    cams: [
      { name: "Gondola · Midway Base", embed: "https://player.brownrice.com/embed/stowemidwaybasestation" },
      { name: "Stowe overview", embed: "https://player.brownrice.com/embed/stowevillage2" },
      { name: "Spruce Peak Village", embed: "https://player.brownrice.com/embed/stowevillage" },
    ],
    region: "ne",
  },
  {
    id: "jay-peak",
    name: "Jay Peak",
    area: "Northern Vermont",
    forecast: "",
    source: "https://jaypeakresort.com/resort/photo-day",
    cams: [
      {
        name: "Tramside",
        snapshot: "https://b15.hdrelay.com/camera/6526fd5a071b19b5189bb07b/snapshot",
        hls: "https://b15.hdrelay.com/camera/6526fd5a071b19b5189bb07b/relay/playlist.m3u8",
      },
      {
        name: "Stateside",
        snapshot: "https://b15.hdrelay.com/camera/6526ffaa1c3bd6b512d2585d/snapshot",
        hls: "https://b15.hdrelay.com/camera/6526ffaa1c3bd6b512d2585d/relay/playlist.m3u8",
      },
    ],
    region: "ne",
  },
  {
    id: "bromley",
    name: "Bromley",
    area: "Southern Vermont",
    forecast: "",
    source: "https://bromley.com/webcams",
    cams: [
      {
        name: "Base Lodge Deck",
        snapshot: "https://b15.hdrelay.com/camera/62c7049a7fd92a4cfa4d6b37/snapshot",
        hls: "https://b15.hdrelay.com/camera/62c7049a7fd92a4cfa4d6b37/relay/playlist.m3u8",
      },
      {
        name: "Mountain View",
        snapshot: "https://b15.hdrelay.com/camera/62c706457fd92a4cfa4d6b39/snapshot",
        hls: "https://b15.hdrelay.com/camera/62c706457fd92a4cfa4d6b39/relay/playlist.m3u8",
      },
    ],
    region: "ne",
  },
  {
    id: "gunstock",
    name: "Gunstock",
    area: "Lakes Region, NH",
    forecast: "gunstock",
    source: "https://www.gunstock.com/discover/webcams/",
    cams: [
      {
        name: "Summit · Lake Winnipesaukee",
        embed: "https://api.wetmet.net/widgets/stream/frame.php?ruc=196-01-01&width={W}&height={H}",
        wetmet: true,
      },
      {
        name: "Trails from Historic Lodge",
        embed: "https://api.wetmet.net/widgets/stream/frame.php?ruc=196-03-01&width={W}&height={H}",
        wetmet: true,
      },
      {
        name: "Base Area & Tubing",
        embed: "https://api.wetmet.net/widgets/stream/frame.php?ruc=196-02-01&width={W}&height={H}",
        wetmet: true,
      },
    ],
    region: "ne",
  },
  {
    id: "loon",
    name: "Loon",
    area: "White Mountains, NH",
    forecast: "",
    source: "https://www.loonmtn.com/mountain-report",
    cams: [
      {
        name: "Loon Peak",
        embed: "https://camstreamer.com/embed/bTSkwcDROmit07OwYenalyn76w0ZIKVlrQ3JZPH6?autoplay=1&mute=1",
      },
      {
        name: "Octagon Base",
        embed: "https://camstreamer.com/embed/X7HniLhNVdyPPKjIekCVxCZ762RvnqAxefwhNpWJ?autoplay=1&mute=1",
      },
      {
        name: "Kanc 8",
        embed: "https://camstreamer.com/embed/pT2GSoPJBxfoe17DiOboezYqHQDEPwI1kDSxv8YE?autoplay=1&mute=1",
      },
      {
        name: "Camp III",
        embed: "https://camstreamer.com/embed/5X9Lxz1XA0W43tjhaLj5UuXTLOY9yJMQlolyV54Q?autoplay=1&mute=1",
      },
    ],
    region: "ne",
  },
  {
    id: "sunday-river",
    name: "Sunday River",
    area: "Western Maine",
    forecast: "",
    source: "https://www.sundayriver.com/mountain-report",
    region: "ne",
    cams: [
      {
        name: "Peak Lodge",
        embed: "https://camstreamer.com/embed/90620e22cfc5c13/S-46290?autoplay=1&mute=1",
      },
      {
        name: "Jordan 8",
        embed: "https://camstreamer.com/embed/5E5cm1GcEmg4mHouq71k87o1ZBylgtWDXYty75WX?autoplay=1&mute=1",
      },
      {
        name: "Skiesta",
        snapshot: "https://app.prismcam.com/public/helpers/realtime_preview.php?c=101&s=720",
      },
      {
        name: "Golf Club",
        embed: "https://www.youtube-nocookie.com/embed/Hstis9bupws?autoplay=1&mute=1&playsinline=1&rel=0",
      },
      {
        name: "Barker 6",
        embed: "https://camstreamer.com/embed/UMVuLvA0PbXuVegiSxW7WmqvQyfbTU5waVM6evhv?autoplay=1&mute=1",
      },
    ],
  },
  {
    id: "sugarloaf",
    name: "Sugarloaf",
    area: "Western Maine",
    forecast: "",
    source: "https://www.sugarloaf.com/mountain-report",
    region: "ne",
    cams: [
      {
        name: "Narrow Gauge",
        embed: "https://camstreamer.com/embed/zho5hPiyYcvKA4Gl4Rel41VIxtAFoXFz7JweN8b4?autoplay=1&mute=1",
      },
      {
        name: "Bullwinkle’s",
        embed: "https://camstreamer.com/embed/DSIekuLO317O8POxXlp7VMJJptZNwLM5o2DMnpdV?autoplay=1&mute=1",
      },
      {
        name: "Base Area (Beach)",
        embed: "https://camstreamer.com/embed/WKeX4tvgmio4g0yNJMCKZMHyGsnPirY5rE4RjXT7?autoplay=1&mute=1",
      },
    ],
  },
  {
    id: "wachusett",
    name: "Wachusett",
    area: "Central Massachusetts",
    forecast: "",
    source: "https://www.wachusett.com/the-mountain/media-center/webcams/",
    cams: [
      {
        name: "Summit",
        embed: "https://api.wetmet.net/widgets/stream/frame.php?uid=28428cda7b1311d070ba4da7d2c0629c",
        wetmet: true,
      },
      {
        name: "Base Lodge",
        embed: "https://api.wetmet.net/widgets/stream/frame.php?uid=e02782b6589cb78c7a6a713813c7e28f",
        wetmet: true,
      },
      {
        name: "Look Mom",
        embed: "https://api.wetmet.net/widgets/stream/frame.php?uid=7779a0b4e49498d466397f061cf39d82",
        wetmet: true,
      },
      {
        name: "Beginner Area",
        embed: "https://api.wetmet.net/widgets/stream/frame.php?uid=091cb124fa06319a70608454e73ffacf",
        wetmet: true,
      },
    ],
    region: "ne",
  },
  {
    id: "ski-sundown",
    name: "Ski Sundown",
    area: "Northwest Connecticut",
    forecast: "",
    source: "https://skisundown.com/the-mountain/mountain-information/#webcam",
    cams: [
      {
        name: "Live webcam",
        embed: "https://www.youtube-nocookie.com/embed/2zVEuh_7rKk?autoplay=1&mute=1&playsinline=1&rel=0",
      },
    ],
    region: "ne",
  },
  {
    id: "mohawk-mountain",
    name: "Mohawk Mountain",
    area: "Northwest Connecticut",
    forecast: "",
    source: "https://www.mohawkmtn.com/the-mountain/webcam/",
    cams: [
      { name: "Summit", embed: "https://v.angelcam.com/iframe?v=8dl5672grx&autoplay=1" },
      { name: "Nutmeg", embed: "https://v.angelcam.com/iframe?v=17rdpm9gre&autoplay=1" },
      { name: "Timber", embed: "https://v.angelcam.com/iframe?v=9klz7233y4&autoplay=1" },
      { name: "Arrowhead", embed: "https://v.angelcam.com/iframe?v=40re0jd2y5&autoplay=1" },
    ],
    region: "ne",
  },
];
const content = document.querySelector("#content");
let active = "utah",
  players = [],
  observer = null;
let hlsLoader = null;
const safe = (x) =>
  String(x).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
function snapshotURL(u) {
  return u + (u.includes("?") ? "&" : "?") + "t=" + Math.floor(Date.now() / 30000);
}
function cameraKind(c) {
  return c.offline ? "offline" : c.hls ? "video" : c.snapshot ? "still" : "player";
}
function cameraStatus(c) {
  return !c.offline && c.snapshot && !c.hls ? "Loading still" : "";
}
function setCameraStatus(cam, text, state) {
  const badge=cam.querySelector(".badge");
  if(badge){badge.hidden=!cam.querySelector("img[data-snapshot]");badge.textContent=text;badge.dataset.state=state;}
}
function wireStill(img) {
  const cam=img.closest(".cam");
  img.onerror=()=>{cam.querySelector(".cam-failure").hidden=false;setCameraStatus(cam,"Still unavailable","error");};
  img.onload=()=>{
    cam.querySelector(".cam-failure").hidden=true;
    setCameraStatus(cam,"Still · loaded "+new Date().toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"}),"still");
  };
  if(img.complete && img.naturalWidth>0) img.onload();
}
function cameraCard(r,c,overview=false) {
  const kind=cameraKind(c);
  return `<article class="card camera-card"><div class="pad cardhead"><div><h2>${overview?`<a href="#${r.id}">${safe(r.name)} ›</a>`:safe(c.name)}</h2>${overview?`<p class="muted">${safe(c.name)}</p>`:""}</div>${overview?`<a class="camera-count" href="#${r.id}">${r.cams.length} views</a>`:(kind==="still"?`<span class="feed-kind">Still image</span>`:"")}</div>${camera(r,c)}${footer(r,c)}</article>`;
}
function groupedResorts(list) {
  return `<div class="grid">${list.map(r=>cameraCard(r,r.cams.find(c=>!c.offline)||r.cams[0],true)).join("")}</div>`;
}
function cameraLoading(c) {
  return c.embed?.startsWith("https://player.brownrice.com/embed/") ? "eager" : "lazy";
}
function camera(r, c) {
  if (c.offline)
    return `<div class="cam"><div class="cam-failure"><strong>${safe(c.name)} is currently offline</strong><a href="${safe(r.source)}" target="_blank" rel="noopener">Check resort camera updates ↗</a></div></div>`;
  return `<div class="cam">${c.hls ? `<video data-hls="${safe(c.hls)}" data-fallback="${safe(c.snapshot)}" poster="${safe(c.snapshot)}" muted autoplay playsinline controls aria-label="${safe(r.name + " · " + c.name + " webcam")}"></video>` : c.snapshot ? `<img data-snapshot="${safe(c.snapshot)}" src="${safe(snapshotURL(c.snapshot))}" alt="${safe(r.name + " · " + c.name + " webcam")}" loading="lazy" referrerpolicy="no-referrer">` : `<iframe ${c.embed.includes("{W}") ? "data-sized" : "src"}="${safe(c.embed)}"${c.wetmet ? ' class="crop" scrolling="no"' : ""} title="${safe(r.name + " · " + c.name + " webcam")}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen loading="${cameraLoading(c)}" referrerpolicy="strict-origin-when-cross-origin"></iframe>`}<span class="badge" data-state="loading" role="status"${c.snapshot && !c.hls ? "" : " hidden"}>${safe(cameraStatus(c))}</span><div class="cam-failure" hidden><strong>Camera feed unavailable</strong><a href="${safe(r.source)}" target="_blank" rel="noopener">Open resort webcams ↗</a></div></div>`;
}
function footer(r, c) {
  return `<div class="cam-footer"><span>${safe(c.name)}</span><a href="${safe(r.source)}" target="_blank" rel="noopener">Resort feed ↗</a></div>`;
}
const REGIONS = {
  utah: {
    name: "Utah",
    title: "Utah resort webcams",
    sub: "Mountain views, snow stakes, and base areas. Select a resort for more cameras.",
    forecast: "../#utah",
  },
  ne: {
    name: "New England",
    title: "New England resort webcams",
    sub: "Vermont, New Hampshire, Maine, Massachusetts, and Connecticut. Select a resort for more cameras.",
    forecast: "../#ne",
  },
};
function regionOf(id) {
  return REGIONS[id] ? id : RESORTS.find((x) => x.id === id)?.region || "utah";
}
function forecastLink(r) {
  return r.forecast ? `../#${r.region}/${r.forecast}/forecast` : REGIONS[r.region].forecast;
}
function render() {
  observer?.disconnect();
  players.forEach((p) => p.destroy());
  players = [];
  const r = RESORTS.find((x) => x.id === active),
    reg = regionOf(active),
    R = REGIONS[reg],
    list = RESORTS.filter((x) => x.region === reg);
  document.querySelector("#title").textContent = r ? r.name + " webcams" : R.title;
  document.querySelector("#resorts").innerHTML = [{ id: reg, name: "All resorts" }, ...list]
    .map((x) => `<a href="#${x.id}" ${x.id === active ? 'aria-current="page"' : ""}>${safe(x.name)}</a>`)
    .join("");
  if (r) {
    content.innerHTML = `<div class="toolbar"><p class="muted">${r.cams.length} camera view${r.cams.length === 1 ? "" : "s"}</p><div class="resort-links"><a class="xlink" href="${forecastLink(r)}">☀ ${r.forecast ? "Forecast" : R.name + " forecasts"} ›</a>${r.region === "utah" ? `<a class="xlink" href="../snow/">❄ Snow report ›</a>${r.id !== "park-city" ? `<a class="xlink" href="${safe(`https://utahavalanchecenter.org/forecast/${r.id === "snowbasin" ? "ogden" : "salt-lake"}`)}" target="_blank" rel="noopener">Avalanche forecast ↗</a>` : ""}` : ""}</div></div><div class="grid" aria-label="${safe(r.name)} cameras">${r.cams.map(c=>cameraCard(r,c)).join("")}</div>`;
  } else {
    content.innerHTML = groupedResorts(list);
  }
  content.querySelectorAll("[data-snapshot]").forEach(wireStill);
  content.querySelectorAll(".cam iframe").forEach(f=>{
    f.onerror=()=>{const cam=f.closest(".cam");cam.querySelector(".cam-failure").hidden=false;setCameraStatus(cam,"Resort player unavailable","error");};
  });
  content.querySelectorAll("iframe[data-sized]").forEach((f) => {
    const w = Math.max(320, Math.round(f.parentElement.clientWidth)),
      h = Math.round((w * 9) / 16);
    f.src = f.dataset.sized.replace("{W}", w).replace("{H}", h);
  });
  startVideos();
  document.title =
    (r ? r.name + " Webcams" : R.title.replace(/\b\w/g, (m) => m.toUpperCase())) + " · Weather Window";
}

function hlsLib() {
  if (window.Hls) return Promise.resolve();
  if (!hlsLoader)
    hlsLoader = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/hls.js@1.7.3/dist/hls.min.js";
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  return hlsLoader;
}
function videoStill(v) {
  if (!v.isConnected) return;
  const cam = v.closest(".cam"),
    img = document.createElement("img");
  img.alt = v.getAttribute("aria-label") + " · camera still";
  img.dataset.snapshot = v.dataset.fallback;
  img.src = snapshotURL(v.dataset.fallback);
  v.replaceWith(img);
  setCameraStatus(cam,"Loading fallback still","loading");
  wireStill(img);
}
function startVideos() {
  observer = new IntersectionObserver(
    (entries) =>
      entries.forEach(async (entry) => {
        if (!entry.isIntersecting) return;
        const v = entry.target;
        const cam=v.closest(".cam");
        observer.unobserve(v);
        try {
          if (v.canPlayType("application/vnd.apple.mpegurl")) {
            v.src = v.dataset.hls;
            v.onerror = () => videoStill(v);
            v.play().catch(() => {});
          } else {
            await hlsLib();
            if (!v.isConnected) return;
            if (!Hls.isSupported()) {
              videoStill(v);
              return;
            }
            const p = new Hls({ maxBufferLength: 15 });
            players.push(p);
            let tries = 0;
            p.on(Hls.Events.ERROR, (_, d) => {
              if (!d.fatal) return;
              if (tries++ < 3) {
                if (d.type === Hls.ErrorTypes.MEDIA_ERROR) p.recoverMediaError();
                else p.startLoad();
                return;
              }
              p.destroy();
              videoStill(v);
            });
            p.loadSource(v.dataset.hls);
            p.attachMedia(v);
            p.on(Hls.Events.MANIFEST_PARSED, () => v.play().catch(() => {}));
          }
        } catch {
          videoStill(v);
        }
      }),
    { rootMargin: "100px" },
  );
  content.querySelectorAll("video[data-hls]").forEach((v) => observer.observe(v));
}

function readHash() {
  let id;
  try { id=decodeURIComponent(location.hash.slice(1)); } catch { id=WW.region(); }
  active = REGIONS[id] || RESORTS.some((r) => r.id === id) ? id : id === "new-england" ? "ne" : WW.region();
  WW.setRegion(regionOf(active), true);
  render();
}
addEventListener("ww-region", (e) => {
  location.hash = e.detail;
});
function refresh() {
  content.querySelectorAll("[data-snapshot]").forEach((img) => {
    if (img.getBoundingClientRect().bottom >= 0 && img.getBoundingClientRect().top < innerHeight)
      img.src = snapshotURL(img.dataset.snapshot);
  });
}
window.addEventListener("hashchange", () => {
  readHash();
  scrollTo(0, 0);
});
function stamp() {
  document.querySelector("#clock").textContent = new Date().toLocaleString("en-US", {
    timeZone: "America/Denver",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}
setInterval(() => {
  if (document.visibilityState === "visible") {
    refresh();
    stamp();
  }
}, 30000);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    refresh();
    stamp();
  }
});
window.suiteContext = () => ({
  app: REGIONS[regionOf(active)].title,
  view: active,
  text: content.innerText,
  note: "Camera images and video are resort feeds, not a weather forecast. Still images refresh every 30 seconds; embedded camera timestamps indicate image freshness.",
});
WW.init({ base: "../", section: "snow", active: "cams" });
readHash();
stamp();
