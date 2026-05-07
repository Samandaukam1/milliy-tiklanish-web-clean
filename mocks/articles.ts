export type Category = {
  id: string;
  name: string;
  slug: string;
};

export type Author = {
  id: string;
  name: string;
  avatar: string;
  verified: boolean;
  role: string;
};

export type Article = {
  id: string;
  title: string;
  excerpt: string;
  cover: string;
  categoryId: string;
  authorId: string;
  publishedAt: string;
  readMinutes: number;
  views: number;
  tier: "free" | "premium" | "vip";
  trending?: boolean;
  hero?: boolean;
  hasAudio?: boolean;
  body: ArticleBlock[];
  tags: string[];
};

export type ArticleBlock =
  | { type: "paragraph"; text: string }
  | { type: "quote"; text: string; by?: string }
  | { type: "heading"; text: string }
  | { type: "image"; url: string; caption?: string };

export type AudioItem = {
  id: string;
  articleId: string;
  title: string;
  author: string;
  cover: string;
  durationSec: number;
  categoryId: string;
};

export type ReelItem = {
  id: string;
  articleId: string;
  title: string;
  cover: string;
  durationSec: number;
  source: "YouTube" | "Studio";
};

export const categories: Category[] = [
  { id: "c1", name: "Siyosat", slug: "siyosat" },
  { id: "c2", name: "Iqtisod", slug: "iqtisod" },
  { id: "c3", name: "Madaniyat", slug: "madaniyat" },
  { id: "c4", name: "Sport", slug: "sport" },
  { id: "c5", name: "Ilm-fan", slug: "ilm-fan" },
  { id: "c6", name: "Jamiyat", slug: "jamiyat" },
  { id: "c7", name: "Texnologiya", slug: "tech" },
  { id: "c8", name: "Ta'lim", slug: "talim" },
  { id: "c9", name: "Sog'liq", slug: "sogliq" },
  { id: "c10", name: "Tarix", slug: "tarix" },
  { id: "c11", name: "Adabiyot", slug: "adabiyot" },
  { id: "c12", name: "San'at", slug: "sanat" },
  { id: "c13", name: "Sayohat", slug: "sayohat" },
  { id: "c14", name: "Oshxona", slug: "oshxona" },
  { id: "c15", name: "Dunyo", slug: "dunyo" },
  { id: "c16", name: "Ekologiya", slug: "ekologiya" },
  { id: "c17", name: "Biznes", slug: "biznes" },
  { id: "c18", name: "Huquq", slug: "huquq" },
  { id: "c19", name: "Din", slug: "din" },
  { id: "c20", name: "Oila", slug: "oila" },
  { id: "c21", name: "Avtomobil", slug: "auto" },
  { id: "c22", name: "Kino", slug: "kino" },
];

export const authors: Author[] = [
  {
    id: "a1",
    name: "Dilnoza Karimova",
    avatar: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=200",
    verified: true,
    role: "Bosh muharrir",
  },
  {
    id: "a2",
    name: "Sardor Tursunov",
    avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200",
    verified: true,
    role: "Siyosiy sharhlovchi",
  },
  {
    id: "a3",
    name: "Malika Rasulova",
    avatar: "https://images.unsplash.com/photo-1502823403499-6ccfcf4fb453?w=200",
    verified: false,
    role: "Madaniyat muxbiri",
  },
  {
    id: "a4",
    name: "Jasur Ermatov",
    avatar: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=200",
    verified: true,
    role: "Iqtisodiyot bo'limi",
  },
  {
    id: "a5",
    name: "Nilufar Yusupova",
    avatar: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=200",
    verified: true,
    role: "Ilmiy muxbir",
  },
];

const LOREM_UZ = [
  "O'zbekiston Respublikasi bugungi kunda mintaqadagi eng dinamik rivojlanayotgan davlatlardan biri sifatida e'tirof etilmoqda. Milliy tiklanish jarayoni jamiyatning barcha qatlamlarida o'z aksini topmoqda.",
  "Mutaxassislarning fikricha, amalga oshirilayotgan islohotlar uzoq muddatli strategik natijalarga qaratilgan bo'lib, ular iqtisodiy o'sish, ijtimoiy barqarorlik va madaniy yuksalishni ta'minlashga xizmat qiladi.",
  "Yoshlar o'rtasida o'tkazilgan so'rov natijalari shuni ko'rsatadiki, bugungi kun yoshlari vatan taqdiriga befarq emas va ular milliy qadriyatlarni zamonaviy dunyo bilan uyg'unlashtirishga intilmoqda.",
  "Shu bilan birga, raqamli transformatsiya jarayonlari an'anaviy tarmoqlarga yangi nafas bag'ishlamoqda. Bu esa ishlab chiqarish samaradorligi va xizmat ko'rsatish sifatini sezilarli darajada oshiradi.",
  "Ekspertlar ta'kidlashicha, kelgusi besh yillikda mamlakatimizda ilm-fan, ta'lim va innovatsiyalar sohasiga e'tibor yanada kuchayadi. Bu — yosh avlodga qo'yilgan eng katta investitsiyadir.",
];

const body = (i: number): ArticleBlock[] => [
  { type: "paragraph", text: LOREM_UZ[i % LOREM_UZ.length] },
  { type: "paragraph", text: LOREM_UZ[(i + 1) % LOREM_UZ.length] },
  { type: "quote", text: "Milliy tiklanish — bu nafaqat o'tmishga hurmat, balki kelajakka ishonchdir.", by: "Tahririyat" },
  { type: "heading", text: "Asosiy yo'nalishlar" },
  { type: "paragraph", text: LOREM_UZ[(i + 2) % LOREM_UZ.length] },
  {
    type: "image",
    url: "https://images.unsplash.com/photo-1524230572899-a752b3835840?w=1200",
    caption: "Toshkent shahri, bugungi kuni",
  },
  { type: "paragraph", text: LOREM_UZ[(i + 3) % LOREM_UZ.length] },
  { type: "paragraph", text: LOREM_UZ[(i + 4) % LOREM_UZ.length] },
];

const covers = [
  "https://images.unsplash.com/photo-1524230572899-a752b3835840?w=1200",
  "https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=1200",
  "https://images.unsplash.com/photo-1516542076529-1ea3854896f2?w=1200",
  "https://images.unsplash.com/photo-1489515217757-5fd1be406fef?w=1200",
  "https://images.unsplash.com/photo-1518972559570-7cc1309f3229?w=1200",
  "https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=1200",
  "https://images.unsplash.com/photo-1585829365295-ab7cd400c167?w=1200",
  "https://images.unsplash.com/photo-1495020689067-958852a7765e?w=1200",
  "https://images.unsplash.com/photo-1526304640581-d334cdbbf45e?w=1200",
  "https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?w=1200",
  "https://images.unsplash.com/photo-1531058020387-3be344556be6?w=1200",
  "https://images.unsplash.com/photo-1523050854058-8df90110c9f1?w=1200",
  "https://images.unsplash.com/photo-1491841550275-ad7854e35ca6?w=1200",
  "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=1200",
  "https://images.unsplash.com/photo-1447069387593-a5de0862481e?w=1200",
  "https://images.unsplash.com/photo-1517048676732-d65bc937f952?w=1200",
  "https://images.unsplash.com/photo-1469571486292-0ba58a3f068b?w=1200",
  "https://images.unsplash.com/photo-1506452305024-9d3f02d1c9b5?w=1200",
  "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=1200",
  "https://images.unsplash.com/photo-1473186505569-9c61870c11f9?w=1200",
  "https://images.unsplash.com/photo-1501594907352-04cda38ebc29?w=1200",
  "https://images.unsplash.com/photo-1529107386315-e1a2ed48a620?w=1200",
  "https://images.unsplash.com/photo-1559136555-9303baea8ebd?w=1200",
  "https://images.unsplash.com/photo-1492724441997-5dc865305da7?w=1200",
  "https://images.unsplash.com/photo-1502920917128-1aa500764cbd?w=1200",
];

const titles = [
  "Yangi O'zbekistonning iqtisodiy yuksalishi: 2026-yil natijalari",
  "Toshkentda xalqaro madaniyat forumi o'z ishini boshladi",
  "Ilm-fanga yo'naltirilgan yoshlar soni ikki baravarga oshdi",
  "Raqamli iqtisod: yangi bozorlar va imkoniyatlar",
  "Milliy futbol terma jamoasi jahon chempionatiga yo'llanma oldi",
  "Adabiyot haftaligi: zamonaviy shoirlar kechasi",
  "Samarqand — 2026-yilning madaniy poytaxti deb e'lon qilindi",
  "Eksport salohiyati: qishloq xo'jaligi mahsulotlari yetakchi",
  "Yangi metro liniyasi ochildi: Toshkent harakatda",
  "Ta'limda raqamli inqilob: maktablar yangi platformaga o'tmoqda",
  "Sog'liqni saqlash: shifokorlar uchun yangi imtiyozlar",
  "Tog'li hududlarda turizm rivojlanmoqda",
  "Oshxona: milliy taomlarning zamonaviy talqini",
  "Dunyo yangiliklari: mintaqaviy hamkorlik kengaymoqda",
  "Ekologiya: Orol bo'yida yangi loyihalar",
  "Biznes start-aplar uchun davlat qo'llab-quvvatlashi",
  "Huquq islohotlari: sud tizimida yangilanishlar",
  "Oilaviy qadriyatlar — bugungi jamiyatning ustuni",
  "Avtomobilsozlikda yangi model taqdim etildi",
  "Kino: o'zbek rejissyorining xalqaro mukofoti",
  "Tarix sahifalari: Amir Temur davri qo'lyozmalari",
  "San'at galereyalarida yangi ko'rgazmalar mavsumi",
  "Texnologiya: mahalliy sun'iy intellekt platformasi",
  "Sport: yosh gimnastlarimiz Osiyo chempioni",
  "Jamiyat: ko'ngilli tashkilotlar faoliyati keng ko'lamda",
];

export const articles: Article[] = titles.map((title, i) => ({
  id: `art-${i + 1}`,
  title,
  excerpt:
    "Tahririyatimiz sharhlovchilari ushbu voqealar mohiyatini chuqur tahlil qilib, kitobxonlarimizga batafsil ma'lumot taqdim etadi.",
  cover: covers[i % covers.length],
  categoryId: categories[i % categories.length].id,
  authorId: authors[i % authors.length].id,
  publishedAt: new Date(Date.now() - i * 1000 * 60 * 60 * 7).toISOString(),
  readMinutes: 3 + (i % 8),
  views: 1200 + i * 317,
  tier: i % 9 === 0 ? "premium" : i % 13 === 0 ? "vip" : "free",
  trending: i < 5,
  hero: i === 0,
  hasAudio: i % 2 === 0,
  body: body(i),
  tags: ["Milliy", "Tahlil", categories[i % categories.length].name],
}));

export const audioItems: AudioItem[] = articles
  .filter((a) => a.hasAudio)
  .slice(0, 10)
  .map((a) => {
    const author = authors.find((x) => x.id === a.authorId)!;
    return {
      id: `aud-${a.id}`,
      articleId: a.id,
      title: a.title,
      author: author.name,
      cover: a.cover,
      durationSec: 180 + (parseInt(a.id.split("-")[1], 10) % 8) * 45,
      categoryId: a.categoryId,
    };
  });

export const reels: ReelItem[] = articles.slice(0, 12).map((a, i) => ({
  id: `reel-${a.id}`,
  articleId: a.id,
  title: a.title,
  cover: a.cover,
  durationSec: 30 + (i % 5) * 12,
  source: i % 2 === 0 ? "Studio" : "YouTube",
}));

export function getAuthor(id: string): Author {
  return authors.find((a) => a.id === id) ?? authors[0];
}
export function getCategory(id: string): Category {
  return categories.find((c) => c.id === id) ?? categories[0];
}
export function getArticle(id: string): Article | undefined {
  return articles.find((a) => a.id === id);
}
