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
  ,["bike","A bicycle","自転車","じてんしゃ","ペダルをこぐと、二つの車輪が回ります。","ぺだるをこぐと、ふたつのしゃりんがまわります。","Its two wheels turn when you pedal."]
  ,["bus","A bus","バス","ばす","停留所で待っていると、大勢の乗客を乗せて来ます。","ていりゅうじょでまっていると、おおぜいのじょうきゃくをのせてきます。","You wait at a bus stop and it arrives carrying many passengers."]
  ,["plane","An airplane","飛行機","ひこうき","滑走路を走ってから、大きな翼で空に上がります。","かっそうろをはしってから、おおきなつばさでそらにあがります。","It rolls along a runway and lifts into the sky on wide wings."]
  ,["sailboat","A sailboat","ヨット","よっと","白い帆に風を受けて、海の上を進みます。","しろいほにかぜをうけて、うみのうえをすすみます。","Wind fills its white sail and carries it across the sea."]
  ,["helicopter","A helicopter","ヘリコプター","へりこぷたー","頭の上の羽根を回して、真上に飛び立ちます。","あたまのうえのはねをまわして、まうえにとびたちます。","It spins the blades overhead and lifts straight up."]
  ,["tractor","A tractor","トラクター","とらくたー","大きな後輪のあるこの車で、畑を耕します。","おおきなこうりんのあるこのくるまで、はたけをたがやします。","You plow a field with this vehicle with large rear wheels."]
  ,["apple","An apple","りんご","りんご","赤い皮のままかじると、しゃきっと音がします。","あかいかわのままかじると、しゃきっとおとがします。","Bite through its red skin and it crunches."]
  ,["cherry","Cherries on stems","さくらんぼ","さくらんぼ","小さな赤い実を軸から取って、種を出しながら食べます。","ちいさなあかいみをじくからとって、たねをだしながらたべます。","You pick the little red fruits off their stems and eat them, removing the pits."]
  ,["lemon","A lemon","レモン","れもん","半分に切って、すっぱい汁を紅茶にしぼります。","はんぶんにきって、すっぱいしるをこうちゃにしぼります。","You cut it in half and squeeze the sour juice into tea."]
  ,["egg","An egg","卵","たまご","殻を割ると、中から黄身と白身が出てきます。","からをわると、なかからきみとしろみがでてきます。","Crack the shell and the yolk and white come out."]
  ,["bread","A loaf of bread","パン","ぱん","薄く切ってトースターで焼き、バターを塗ります。","うすくきってとーすたーでやき、ばたーをぬります。","You slice it, toast it, and spread butter on it."]
  ,["cheese","A wedge of cheese","チーズ","ちーず","牛乳から作ります。ピザにのせて焼くと、とろりと溶けます。","ぎゅうにゅうからつくります。ぴざにのせてやくと、とろりととけます。","It is made from milk and melts when baked on pizza."]
  ,["camera","A camera","カメラ","かめら","レンズを花に向けて、シャッターを押します。","れんずをはなにむけて、しゃったーをおします。","You aim its lens at a flower and press the shutter."]
  ,["printer","A printer","プリンター","ぷりんたー","パソコンから書類を送ると、文字が紙に印刷されます。","ぱそこんからしょるいをおくると、もじがかみにいんさつされます。","Send it a document from a computer and it prints the text on paper."]
  ,["mouse","A computer mouse","マウス","まうす","机の上で動かすと、画面の矢印が動きます。","つくえのうえでうごかすと、がめんのやじるしがうごきます。","Moving it across the desk moves the arrow on the screen."]
  ,["keyboard","A keyboard","キーボード","きーぼーど","両手の指でキーを押して、文章を入力します。","りょうてのゆびできーをおして、ぶんしょうをにゅうりょくします。","You press keys with both hands to type sentences."]
  ,["bulb","A light bulb","電球","でんきゅう","天井のソケットに取り付けて、部屋を明るくします。","てんじょうのそけっとにとりつけて、へやをあかるくします。","You fit it into a ceiling socket to light the room."]
  ,["phone","A telephone handset","電話","でんわ","受話器を耳に当てて、遠くの人と話します。","じゅわきをみみにあてて、とおくのひととはなします。","You hold the receiver to your ear to speak to someone far away."]
];

// Each exact six-card set has a single referent per clue. Do not fill a
// short deal from unrelated/random pictures without checking the new set.
const base = records.map(([id, description, word, kana, clue, reading, translation],i) => ({
  ...draft, id, pictureId:id, description, word, kana, clue, reading, translation,
  distractors: records.slice(i - i % 6, i - i % 6 + 6).map(([key]) => key).filter(key => key !== id)
}));
const extraClues = [
  ["umbrella","玄関で水を切ってから、たたんで立てておきます。","げんかんでみずをきってから、たたんでたてておきます。","At the entrance you shake off the water, fold it, and stand it upright."],
  ["bike","坂道では、サドルから腰を上げてペダルをこぎます。","さかみちでは、さどるからこしをあげてぺだるをこぎます。","On a hill you rise off the saddle to pedal."],
  ["egg","朝ご飯に、殻ごとゆでて塩を少しつけて食べます。","あさごはんに、からごとゆでてしおをすこしつけてたべます。","For breakfast you boil it in its shell and eat it with a little salt."],
  ["printer","紙が詰まって、印刷が途中で止まりました。","かみがつまって、いんさつがとちゅうでとまりました。","Paper got jammed and printing stopped halfway through."]
];
export const items = [...base, ...extraClues.map(([pictureId, clue, reading, translation]) => ({
  ...base.find(card => card.id === pictureId), id:`${pictureId}-scene`, clue, reading, translation
}))];
