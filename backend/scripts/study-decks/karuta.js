import { gameCredits as draft } from "./credits.js";

const records = [
  ["umbrella","An open umbrella","傘","かさ","雨の日に、頭の上に広げます。","あめのひに、あたまのうえにひろげます。","On a rainy day you open it over your head."],
  ["clock","A round clock with hands","時計","とけい","長い針と短い針で、時刻を示します。","ながいはりとみじかいはりで、じこくをしめします。","Its long and short hands tell the time."],
  ["cup","A cup with a handle","カップ","かっぷ","取っ手を持って、中のコーヒーを飲みます。","とってをもって、なかのこーひーをのみます。","You hold its handle and drink the coffee inside."],
  ["scissors","A pair of scissors","はさみ","はさみ","二枚の刃を開いたり閉じたりして、紙を切ります。","にまいのはをひらいたりとじたりして、かみをきります。","You open and close two blades to cut paper."],
  ["key","A key with a notched end","鍵","かぎ","ドアの鍵穴に入れて回します。","どあのかぎあなにいれてまわします。","You put it into a door’s keyhole and turn it."],
  ["book","An open book","本","ほん","ページをめくって、物語を読みます。","ぺーじをめくって、ものがたりをよみます。","You turn its pages to read a story."],
  ["fish","A fish with scales and a tail fin","魚","さかな","ひれを使って、水の中を泳ぎます。","ひれをつかって、みずのなかをおよぎます。","It uses fins to swim through the water."],
  ["rabbit","A rabbit with long ears","うさぎ","うさぎ","耳が長くて、後ろ足でぴょんぴょん跳びます。","みみがながくて、うしろあしでぴょんぴょんとびます。","It has long ears and hops on its hind legs."],
  ["banana","A curved banana","バナナ","ばなな","黄色い皮をむいて食べる、細長い果物です。","きいろいかわをむいてたべる、ほそながいくだものです。","A long, narrow fruit whose yellow peel you remove before eating."],
  ["carrot","A tapered carrot with leafy greens","にんじん","にんじん","土の中で育つ、オレンジ色の細長い野菜です。","つちのなかでそだつ、おれんじいろのほそながいやさいです。","A long orange vegetable that grows underground."],
  ["tent","A triangular camping tent","テント","てんと","キャンプのときに張って、中で寝ます。","きゃんぷのときにはって、なかでねます。","You pitch it when camping and sleep inside."],
  ["piano","A row of piano keys on an upright piano","ピアノ","ぴあの","白と黒の鍵盤を指で弾いて、曲を演奏します。","しろとくろのけんばんをゆびでひいて、きょくをえんそうします。","You play a tune by pressing its white and black keys."],
  ["library","Shelves of books beside a reading table","図書館","としょかん","ここでは、本を借りて家で読むことができます。","ここでは、ほんをかりていえでよむことができます。","Here you can borrow books to read at home."],
  ["station","A train alongside a station platform","駅","えき","ここで電車を待ったり、電車を降りたりします。","ここででんしゃをまったり、でんしゃをおりたりします。","Here you wait for trains or get off them."],
  ["post","A post counter with an envelope and a postal mark","郵便局","ゆうびんきょく","手紙を送るために、ここの窓口で切手を買います。","てがみをおくるために、ここのまどぐちできってをかいます。","You buy stamps at this counter to send a letter."],
  ["swimming","A swimmer moving through waves","泳ぐ","およぐ","水の中で、腕と足を動かして前に進みます。","みずのなかで、うでとあしをうごかしてまえにすすみます。","You move forward through water using your arms and legs."],
  ["skiing","A skier holding poles on a slope","スキー","すきー","両足に細長い板をつけて、雪の上を滑ります。","りょうあしにほそながいいたをつけて、ゆきのうえをすべります。","You attach long narrow boards to both feet and glide over snow."],
  ["fishing","A person holding a fishing rod with a line in the water","釣り","つり","水に糸を垂らして、魚がかかるのを待ちます。","みずにいとをたらして、さかながかかるのをまちます。","You lower a line into the water and wait for a fish to bite."]
];

// Each exact six-card set has a single referent per clue. Do not fill a
// short deal from unrelated/random pictures without checking the new set.
export const items = records.map(([id, description, word, kana, clue, reading, translation],i) => ({
  ...draft, id, description, word, kana, clue, reading, translation,
  distractors: records.slice(i - i % 6, i - i % 6 + 6).map(([key]) => key).filter(key => key !== id)
}));
