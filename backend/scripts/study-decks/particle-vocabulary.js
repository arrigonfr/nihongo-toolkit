export const people = [
  ["田中","たなか","Tanaka"], ["佐藤","さとう","Sato"], ["鈴木","すずき","Suzuki"],
  ["高橋","たかはし","Takahashi"], ["渡辺","わたなべ","Watanabe"], ["伊藤","いとう","Ito"],
  ["山本","やまもと","Yamamoto"], ["中村","なかむら","Nakamura"], ["小林","こばやし","Kobayashi"],
  ["加藤","かとう","Kato"], ["吉田","よしだ","Yoshida"], ["山田","やまだ","Yamada"],
  ["佐々木","ささき","Sasaki"], ["山口","やまぐち","Yamaguchi"], ["松本","まつもと","Matsumoto"],
  ["井上","いのうえ","Inoue"], ["木村","きむら","Kimura"], ["林","はやし","Hayashi"],
  ["清水","しみず","Shimizu"], ["山崎","やまざき","Yamazaki"], ["森","もり","Mori"],
  ["池田","いけだ","Ikeda"], ["橋本","はしもと","Hashimoto"], ["阿部","あべ","Abe"],
  ["石川","いしかわ","Ishikawa"], ["中島","なかじま","Nakajima"], ["前田","まえだ","Maeda"],
  ["藤田","ふじた","Fujita"], ["小川","おがわ","Ogawa"], ["後藤","ごとう","Goto"],
  ["岡田","おかだ","Okada"], ["長谷川","はせがわ","Hasegawa"], ["村上","むらかみ","Murakami"],
  ["近藤","こんどう","Kondo"], ["石井","いしい","Ishii"], ["坂本","さかもと","Sakamoto"],
  ["遠藤","えんどう","Endo"], ["青木","あおき","Aoki"], ["藤井","ふじい","Fujii"],
  ["西村","にしむら","Nishimura"], ["福田","ふくだ","Fukuda"], ["太田","おおた","Ota"],
  ["三浦","みうら","Miura"], ["藤原","ふじわら","Fujiwara"], ["岡本","おかもと","Okamoto"],
  ["松田","まつだ","Matsuda"], ["中川","なかがわ","Nakagawa"], ["中野","なかの","Nakano"]
].map(([name, reading, english]) => [`${name}さん`, `${reading}さん`, english]);

export const objects = [
  ["本","ほん","book"], ["雑誌","ざっし","magazine"], ["漫画","まんが","comic"],
  ["教科書","きょうかしょ","textbook"], ["手帳","てちょう","planner"], ["鉛筆","えんぴつ","pencil"],
  ["ペン","ぺん","pen"], ["消しゴム","けしごむ","eraser"], ["定規","じょうぎ","ruler"],
  ["はさみ","はさみ","pair of scissors"], ["電卓","でんたく","calculator"], ["筆箱","ふでばこ","pencil case"],
  ["財布","さいふ","wallet"], ["小銭入れ","こぜにいれ","coin purse"], ["名刺入れ","めいしいれ","business card holder"],
  ["リュック","りゅっく","backpack"], ["水筒","すいとう","water bottle"], ["弁当箱","べんとうばこ","lunch box"],
  ["コップ","こっぷ","cup"], ["マグカップ","まぐかっぷ","mug"], ["皿","さら","plate"],
  ["お椀","おわん","bowl"], ["スプーン","すぷーん","spoon"], ["フォーク","ふぉーく","fork"],
  ["ナイフ","ないふ","knife"], ["箸","はし","pair of chopsticks"], ["タオル","たおる","towel"],
  ["ハンカチ","はんかち","handkerchief"], ["マフラー","まふらー","scarf"], ["手袋","てぶくろ","gloves"],
  ["上着","うわぎ","jacket"], ["コート","こーと","coat"], ["シャツ","しゃつ","shirt"],
  ["靴","くつ","shoes"], ["サンダル","さんだる","sandals"], ["眼鏡","めがね","glasses"],
  ["鏡","かがみ","mirror"], ["櫛","くし","comb"], ["ブラシ","ぶらし","brush"],
  ["懐中電灯","かいちゅうでんとう","flashlight"], ["充電器","じゅうでんき","charger"], ["イヤホン","いやほん","earphones"],
  ["ヘッドホン","へっどほん","headphones"], ["携帯電話","けいたいでんわ","mobile phone"], ["パソコン","ぱそこん","computer"],
  ["封筒","ふうとう","envelope"], ["便箋","びんせん","writing paper"], ["切手","きって","stamp"]
];

export const places = [
  ["銀行","ぎんこう","bank"], ["郵便局","ゆうびんきょく","post office"], ["市役所","しやくしょ","city hall"],
  ["区役所","くやくしょ","ward office"], ["役場","やくば","town office"], ["交番","こうばん","police box"],
  ["消防署","しょうぼうしょ","fire station"], ["保健所","ほけんじょ","health center"], ["薬局","やっきょく","pharmacy"],
  ["診療所","しんりょうじょ","clinic"], ["歯医者","はいしゃ","dentist's office"], ["大学","だいがく","university"],
  ["高校","こうこう","high school"], ["中学校","ちゅうがっこう","middle school"], ["小学校","しょうがっこう","elementary school"],
  ["幼稚園","ようちえん","kindergarten"], ["保育園","ほいくえん","nursery school"], ["学習塾","がくしゅうじゅく","tutoring school"],
  ["映画館","えいがかん","cinema"], ["劇場","げきじょう","theater"], ["ホール","ほーる","hall"],
  ["体育館","たいいくかん","gymnasium"], ["競技場","きょうぎじょう","stadium"], ["野球場","やきゅうじょう","baseball stadium"],
  ["動物園","どうぶつえん","zoo"], ["水族館","すいぞくかん","aquarium"], ["植物園","しょくぶつえん","botanical garden"],
  ["遊園地","ゆうえんち","amusement park"], ["庭園","ていえん","garden"], ["神社","じんじゃ","shrine"],
  ["寺","てら","temple"], ["教会","きょうかい","church"], ["城","しろ","castle"],
  ["市場","いちば","market"], ["商店街","しょうてんがい","shopping street"], ["スーパー","すーぱー","supermarket"],
  ["本屋","ほんや","bookshop"], ["花屋","はなや","flower shop"], ["パン屋","ぱんや","bakery"],
  ["レストラン","れすとらん","restaurant"], ["食堂","しょくどう","cafeteria"], ["カフェ","かふぇ","cafe"],
  ["旅館","りょかん","inn"], ["港","みなと","port"], ["バス停","ばすてい","bus stop"],
  ["工場","こうじょう","factory"], ["会社","かいしゃ","company office"], ["公民館","こうみんかん","community center"]
];

export const foods = [
  ["いちご","いちご","strawberries"], ["ぶどう","ぶどう","grapes"], ["桃","もも","peaches"],
  ["梨","なし","pears"], ["柿","かき","persimmons"], ["すいか","すいか","watermelon"],
  ["メロン","めろん","melon"], ["レモン","れもん","lemons"], ["パイナップル","ぱいなっぷる","pineapple"],
  ["キウイ","きうい","kiwis"], ["さくらんぼ","さくらんぼ","cherries"], ["ブルーベリー","ぶるーべりー","blueberries"],
  ["キャベツ","きゃべつ","cabbage"], ["白菜","はくさい","Chinese cabbage"], ["大根","だいこん","daikon"],
  ["玉ねぎ","たまねぎ","onions"], ["きゅうり","きゅうり","cucumbers"], ["なす","なす","eggplants"],
  ["ピーマン","ぴーまん","green peppers"], ["ほうれん草","ほうれんそう","spinach"], ["ブロッコリー","ぶろっこりー","broccoli"],
  ["かぼちゃ","かぼちゃ","pumpkin"], ["さつまいも","さつまいも","sweet potatoes"], ["とうもろこし","とうもろこし","corn"],
  ["きのこ","きのこ","mushrooms"], ["しいたけ","しいたけ","shiitake mushrooms"], ["豆腐","とうふ","tofu"],
  ["納豆","なっとう","natto"], ["ヨーグルト","よーぐると","yogurt"], ["バター","ばたー","butter"],
  ["ハム","はむ","ham"], ["ソーセージ","そーせーじ","sausages"], ["鶏肉","とりにく","chicken"],
  ["豚肉","ぶたにく","pork"], ["牛肉","ぎゅうにく","beef"], ["魚","さかな","fish"],
  ["えび","えび","shrimp"], ["おにぎり","おにぎり","rice balls"], ["サンドイッチ","さんどいっち","sandwiches"],
  ["うどん","うどん","udon"], ["そば","そば","soba"], ["パスタ","ぱすた","pasta"],
  ["クッキー","くっきー","cookies"], ["ビスケット","びすけっと","biscuits"], ["チョコレート","ちょこれーと","chocolate"],
  ["アイスクリーム","あいすくりーむ","ice cream"], ["ジャム","じゃむ","jam"], ["はちみつ","はちみつ","honey"]
];

const hours = [
  ["一","いち"], ["二","に"], ["三","さん"], ["四","よ"], ["五","ご"], ["六","ろく"],
  ["七","しち"], ["八","はち"], ["九","く"], ["十","じゅう"], ["十一","じゅういち"], ["十二","じゅうに"]
];
const minutes = [["五","ごふん","05"], ["十五","じゅうごふん","15"], ["三十","さんじゅっぷん","30"], ["四十五","よんじゅうごふん","45"]];
export const times = hours.flatMap(([hour, reading], index) =>
  minutes.map(([minute, sound, number]) => [`${hour}時${minute}分`, `${reading}じ${sound}`, `${index + 1}:${number}`])
);
