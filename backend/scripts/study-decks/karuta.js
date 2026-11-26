import { gameCredits as draft } from "./credits.js";
import { expandKaruta } from "./karuta-expansion.js";
import { extraRecords } from "./karuta-extra.js";

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
  ,["sun","A bright sun","太陽","たいよう","朝、東の空から昇って、世界を明るく照らします。","あさ、ひがしのそらからのぼって、せかいをあかるくてらします。","In the morning it rises in the eastern sky and lights up the world."]
  ,["cloud","A fluffy cloud","雲","くも","白い綿のように、青空の上をゆっくり浮かんでいます。","しろいわたのように、あおぞらのうえをゆっくりうかんでいます。","Like white cotton, it floats slowly across the blue sky."]
  ,["snowman","A snowman","雪だるま","ゆきだるま","白い雪を二つ丸めて重ね、冬に庭で作ります。","しろいゆきをふたつまるめてかさね、ふゆににわでつくります。","You roll two balls of white snow, stack them, and build it in the yard in winter."]
  ,["lightning","A bolt of lightning","雷","かみなり","嵐の夜に、暗い空でぴかっと光って大きな音が鳴ります。","あらしのよるに、くらいそらでぴかっとひかっておおきなおとがなります。","On a stormy night it flashes brightly in the dark sky with a loud roar."]
  ,["rainbow","A rainbow arch","虹","にじ","雨が上がったあと、空に七色の大きなアーチが出ます。","あめがあがったあと、そらになないろのおおきなあーちがでます。","After the rain clears, a big seven-colored arch appears in the sky."]
  ,["wind","Gusts of wind","風","かぜ","目には見えませんが、木の葉を揺らしたり頬に当たったりします。","めにはみえませんが、このはをゆらしたりほおにあたったりします。","You cannot see it, yet it shakes the leaves and brushes against your cheek."]
  ,["hat","A brimmed hat","帽子","ぼうし","強い日差しをよけるために、頭の上にかぶります。","つよいひざしをよけるために、あたまのうえにかぶります。","You wear it on your head to block the strong sun."]
  ,["glasses","A pair of eyeglasses","眼鏡","めがね","遠くの文字が見えにくいとき、目の前にかけます。","とおくのもじがみえにくいとき、めのまえにかけます。","When distant letters are hard to see, you put them on over your eyes."]
  ,["shoe","A lace-up shoe","靴","くつ","外に出かけるとき、玄関で足に履いてひもを結びます。","そとにでかけるとき、げんかんであしにはいてひもをむすびます。","When going outside, you put it on your foot at the entrance and tie the laces."]
  ,["bag","A shoulder bag","鞄","かばん","財布や本をまとめて入れて、外へ持ち歩きます。","さいふやほんをまとめていれて、そとへもちあるきます。","You pack your wallet and books inside it and carry it out with you."]
  ,["shirt","A collared shirt","シャツ","しゃつ","前のボタンを留めて、上半身に着る服です。","まえのぼたんをとめて、じょうはんしんにきるふくです。","A garment for your upper body that you fasten with front buttons."]
  ,["watch","A wristwatch","腕時計","うでどけい","手首に巻いておけば、いつでもすぐに時間が分かります。","てくびにまいておけば、いつでもすぐにじかんがわかります。","Strap it around your wrist and you can check the time anytime."]
];

// Each exact six-card set has a single referent per clue. Do not fill a
// short deal from unrelated/random pictures without checking the new set.
const allRecords = [...records, ...extraRecords];
const base = allRecords.map(([id, description, word, kana, clue, reading, translation],i) => ({
  ...draft, id, pictureId:id, description, word, kana, clue, reading, translation,
  distractors: allRecords.slice(i - i % 6, i - i % 6 + 6).map(([key]) => key).filter(key => key !== id)
}));
const extraClues = [
  ["umbrella","scene","玄関で水を切ってから、たたんで立てておきます。","げんかんでみずをきってから、たたんでたてておきます。","At the entrance you shake off the water, fold it, and stand it upright."],
  ["umbrella","use","急に雨が降り出したので、駅の売店で一本買いました。","きゅうにあめがふりだしたので、えきのばいてんでいっぽんかいました。","Rain suddenly started falling, so I bought one at the station kiosk."],
  ["clock","scene","壁にかかっていて、もうすぐ昼の十二時を指しています。","かべにかかっていて、もうすぐひるのじゅうにじをさしています。","It hangs on the wall and is almost pointing to noon."],
  ["clock","use","毎朝、鳴る前に目が覚めて針を見ます。","まいあさ、なるまえにめがさめてはりをみます。","Every morning I wake up before it rings and look at its hands."],
  ["cup","scene","熱い紅茶を注ぐと、上から白い湯気が上がります。","あついこうちゃをそそぐと、うえからしろいゆげがあがります。","When you pour hot tea into it, white steam rises from the top."],
  ["cup","use","飲み終わったら、台所で洗って棚にしまいます。","のみおわったら、だいどころであらってたなにしまいます。","When you finish drinking, you wash it in the kitchen and put it on the shelf."],
  ["scissors","scene","工作の時間に、画用紙を線に沿ってまっすぐ切ります。","こうさくのじかんに、がようしをせんにそってまっすぐきります。","In craft class you cut construction paper straight along the line."],
  ["scissors","use","袋の口が開かないとき、端を少し切るのに使います。","ふくろのくちがあかないとき、はしをすこしきるのにつかいます。","When a bag will not open, you use it to snip the corner."],
  ["key","scene","出かける前に、これで玄関にロックをかけます。","でかけるまえに、これでげんかんにろっくをかけます。","Before heading out, you lock the front door with this."],
  ["key","use","ポケットに入れたはずなのに見つからず、家に入れません。","ぽけっとにいれたはずなのにみつからず、いえにはいれません。","I thought I put it in my pocket, but I cannot find it and cannot get into the house."],
  ["book","scene","寝る前にしおりを挟んで、続きは明日読むことにします。","ねるまえにしおりをはさんで、つづきはあしたよむことにします。","Before bed you tuck in a bookmark and save the rest for tomorrow."],
  ["book","use","表紙のデザインにひかれて、書店で買って帰りました。","ひょうしのでざいんにひかれて、しょてんでかってかえりました。","Drawn by the cover design, I bought it at the bookstore and brought it home."],
  ["fish","scene","きれいな川の中で、群れを作ってすいすい動いています。","きれいなかわのなかで、むれをつくってすいすいうごいています。","In a clear river, they form a school and glide smoothly along."],
  ["fish","use","塩を振って網で焼くと、香ばしい匂いがします。","しおをふってあみでやくと、こうばしいにおいがします。","Sprinkle it with salt and grill it on a rack for a savory aroma."],
  ["rabbit","scene","ふわふわの白い体で、草を静かに食べています。","ふわふわのしろいからだで、くさをしずかにたべています。","With its fluffy white body, it quietly nibbles on grass."],
  ["rabbit","use","お月見の季節になると、月の中で餅をつく話が出ます。","おつきみのきせつになると、つきのなかでもちをつくはなしがでます。","When moon-viewing season arrives, people tell the story of it pounding mochi on the moon."],
  ["banana","scene","朝ご飯に一本むいて、ヨーグルトと一緒に食べます。","あさごはんにいっぽんむいて、よーぐるとといっしょにたべます。","For breakfast you peel one and eat it with yogurt."],
  ["banana","use","房で買ってきて、少し甘くなってから食べます。","ふさでかってきて、すこしあまくなってからたべます。","You buy them in a bunch and eat them once they sweeten a little."],
  ["carrot","scene","カレーやシチューを作るとき、小さく切って鍋に入れます。","かれーやしちゅーをつくるとき、ちいさくきってなべにいれます。","When making curry or stew, you chop it small and put it in the pot."],
  ["carrot","use","葉っぱのついたまま畑から引き抜いて、土を洗い落とします。","はっぱのついたままはたけからひきぬいて、つちをあらいおとします。","You pull it from the field with its leafy top still on and wash off the soil."],
  ["tent","scene","夕方に山へ着いて、みんなで力を合わせて組み立てました。","ゆうがたにやまへついて、みんなでちからをあわせてくみたてました。","We reached the mountain in the evening and worked together to pitch it."],
  ["tent","use","夜になると入り口のファスナーを閉めて、寝袋に入ります。","よるになるといりぐちのふぁすなーをしめて、ねぶくろにはいります。","At night you zip the entrance shut and climb into your sleeping bag."],
  ["piano","scene","音楽室に置いてあり、先生が伴奏を弾いてくれます。","おんがくしつにおいてあり、せんせいがばんそうをひいてくれます。","It sits in the music room, where the teacher plays accompaniment."],
  ["piano","use","発表会の前に、毎日少しずつ指の練習を続けます。","はっぴょうかいのまえに、まいにちすこしずつゆびのれんしゅうをつづけます。","Before the recital, you practice your fingerings a little every day."],
  ["library","scene","静かな閲覧室で、調べ物をしながらノートを取ります。","しずかなえつらんしつで、しらべものをしながらのーとをとります。","In the quiet reading room, you take notes while doing research."],
  ["library","use","返却日が近づいたので、カウンターへ返しに行きます。","へんきゃくびがちかづいたので、かうんたーへかえしにいきます。","The due date is coming up, so you go to the desk to return them."],
  ["station","scene","改札を通って、案内表示を見ながらホームへ急ぎます。","かいさつをとおって、あんないひょうじをみながらほーむへいそぎます。","You pass through the ticket gate and hurry to the platform checking the signs."],
  ["station","use","待ち合わせの時間まで、北口の前で友達を待っています。","まちあわせのじかんまで、きたぐちのまえでともだちをまっています。","Until the meeting time, you wait for your friend outside the north exit."],
  ["post","scene","重さを量ってもらってから、小包を遠くの家族へ送ります。","おもさをはかってもらってから、こづつみをとおくのかぞくへおくります。","After having it weighed, you mail the parcel to family far away."],
  ["post","use","年賀状やはがきを出しに、赤いマークの建物へ寄ります。","ねんがじょうやはがきをだしに、あかいまーくのたてものへよります。","You stop by the building with the red mark to send postcards."],
  ["swimming","scene","ゴーグルをつけて、プールの端から端まで息継ぎしながら進みます。","ごーぐるをつけて、ぷーるのはしからはしまでいきつぎしながらすすみます。","Wearing goggles, you move from one end of the pool to the other, breathing as you go."],
  ["swimming","use","夏の暑い日に海へ入って、波の間を気持ちよく進みます。","なつのあついひにうみへはいって、なみのあいだをきもちよくすすみます。","On a hot summer day you enter the sea and glide comfortably through the waves."],
  ["skiing","scene","リフトで山の高いところまで登り、白い斜面を滑り降ります。","りふとでやまのたかいところまでのぼり、しろいしゃめんをすべりおります。","You ride a lift high up the mountain and glide down the white slope."],
  ["skiing","use","ストックを両手に持って、カーブを曲がりながら雪を進みます。","すとっくをりょうてにもって、かーぶをまがりながらゆきをすすみます。","Holding poles in both hands, you carve turns across the snow."],
  ["fishing","scene","早朝に川岸へ座り、浮きが動くのをじっと見つめます。","そうちょうにかわぎしへすわり、うきがうごくのをじっとみつめます。","Early in the morning you sit by the riverbank and watch the bobber closely."],
  ["fishing","use","長い竿を振って沖へ投げ、手ごたえがあったらリールを巻きます。","ながいさおをふっておきへなげ、てごたえがあったらりーるをまきます。","You cast a long rod out and reel it in as soon as you feel a tug."],
  ["bike","scene","坂道では、サドルから腰を上げてペダルをこぎます。","さかみちでは、さどるからこしをあげてぺだるをこぎます。","On a hill you rise off the saddle to pedal."],
  ["bike","use","駅まで乗っていって、駐輪場に鍵をかけて停めます。","えきまでのっていって、ちゅうりんじょうにかぎをかけてとめます。","You ride it to the station, lock it, and park it in the rack."],
  ["bus","scene","後ろのドアから乗って、降りたい停留所でボタンを押します。","うしろのどあからのって、おりたいていりゅうじょでぼたんをおします。","You board through the rear door and press the button for your stop."],
  ["bus","use","大きな窓から町の景色を見ながら、終点まで乗っていきます。","おおきなまどからまちのけしきをみながら、しゅうてんまでのっていきます。","Looking at the town through the wide windows, you ride it to the final stop."],
  ["plane","scene","空港で搭乗手続きを済ませて、雲の上を飛ぶ旅に出ます。","くうこうでとうじょうてつづきをすませて、くものうえをとぶたびにでます。","After checking in at the airport, you set off on a trip flying above the clouds."],
  ["plane","use","窓の外を見ると、町や海が小さく広がっています。","まどのそとをみると、まちやうみがちいさくひろがっています。","Looking out the window, the towns and sea stretch out tiny below."],
  ["sailboat","scene","エンジンを使わず、風の向きを読んで海を渡ります。","えんじんをつかわず、かぜのむきをよんでうみをわたります。","Without using an engine, you read the wind direction to cross the sea."],
  ["sailboat","use","港から出て、白い帆を大きく張って波の上を進みます。","みなとからでて、しろいほをおおきくはってなみのうえをすすみます。","Leaving the harbor, you raise the white sail wide and glide over the waves."],
  ["helicopter","scene","広い滑走路がなくても、ビルの屋上に着陸できます。","ひろいかっそうろがなくても、びるのおくじょうにちゃくりくできます。","Even without a long runway, it can land on a building’s rooftop."],
  ["helicopter","use","大きな羽根の音を立てて、空の一点にとどまることができます。","おおきなはねのおとをたてて、そらのいってんにとどまることができます。","Making a loud rotor sound, it can hover in one spot in the sky."],
  ["tractor","scene","広い農場で土を起こし、種をまく準備をします。","ひろいのうじょうでつちをおこし、たねをまくじゅんびをします。","On a wide farm it turns over the soil to prepare for planting seeds."],
  ["tractor","use","ぬかるんだ畑の中でも、ごついタイヤで力強く進みます。","ぬかるんだはたけのなかでも、ごついたいやでちからづよくすすみます。","Even in a muddy field, its heavy tires drive powerfully forward."],
  ["apple","scene","皮をむいてくし形に切り、おやつにみんなで分けます。","かわをむいてくしがたにきり、おやつにみんなでわけます。","You peel it, slice it into wedges, and share it as a snack."],
  ["apple","use","秋になると、甘酸っぱい赤い実がたくさん実ります。","あきになると、あまずっぱいあかいみがたくさんみのります。","In autumn, plenty of sweet-tart red fruits ripen on the trees."],
  ["cherry","scene","初夏のころ、二つつながった赤い実を器に盛ります。","しょかのころ、ふたつつながったあかいみをうつわにもります。","In early summer you place pairs of joined red fruits in a bowl."],
  ["cherry","use","ケーキの上にちょこんと乗っている、つやつやした小さな実です。","けーきのうえにちょこんとのっている、つやつやしたちいさなみです。","A glossy little fruit perched right on top of a cake."],
  ["lemon","scene","から揚げに少ししぼると、さっぱりした味になります。","からあげにすこししぼると、さっぱりしたあじになります。","Squeeze a little onto fried chicken for a refreshing flavor."],
  ["lemon","use","鮮やかな黄色い皮をすりおろすと、さわやかな香りが広がります。","あざやかなきいろいかわをすりおろすと、さわやかなかおりがひろがります。","Grating its bright yellow peel releases a crisp, fresh scent."],
  ["egg","scene","朝ご飯に、殻ごとゆでて塩を少しつけて食べます。","あさごはんに、からごとゆでてしおをすこしつけてたべます。","For breakfast you boil it in its shell and eat it with a little salt."],
  ["egg","use","フライパンに割り入れて、黄身が半熟のうちに焼き上げます。","ふらいぱんにわりいれて、きみがはんじゅくのうちにやきあげます。","Crack it into a frying pan and cook it while the yolk is still soft."],
  ["bread","scene","朝、焼きたての香ばしい匂いが店の中から漂ってきます。","あさ、やきたてのこうばしいにおいがみせのなかからただよってきます。","In the morning, its freshly baked aroma drifts out from the shop."],
  ["bread","use","野菜やハムを間に挟んで、お昼のサンドイッチにします。","やさいやはむをあいだにはさんで、おひるのさんどいっちにします。","Tuck vegetables and ham between slices to make a lunchtime sandwich."],
  ["cheese","scene","クラッカーにのせて食べると、コクのある塩気が広がります。","くらっかーにのせてたべると、こくのあるしおけがひろがります。","Eat it on a cracker for a rich, savory saltiness."],
  ["cheese","use","温めた鍋でとろとろに溶かし、野菜をつけて楽しみます。","あたためたなべでとろとろにとかし、やさいをつけてたのしみます。","Melt it smoothly in a warm pot and dip vegetables into it."],
  ["camera","scene","旅行先のきれいな景色を、思い出として一枚残します。","りょこうさきのきれいなけしきを、おもいでとしていちまいのこします。","You capture a lovely travel view as a lasting memory."],
  ["camera","use","ピントを合わせてから、ぶれないように両手でしっかり構えます。","ぴんとをあわせてから、ぶれないようにりょうてでしっかりかまえます。","After focusing, you hold it steady with both hands so the shot does not blur."],
  ["printer","scene","紙が詰まって、印刷が途中で止まりました。","かみがつまって、いんさつがとちゅうでとまりました。","Paper got jammed and printing stopped halfway through."],
  ["printer","use","インクが切れそうなので、新しいカートリッジに交換します。","いんくがきれそうなので、あたらしいかーとりっじにこうかんします。","The ink is almost out, so you swap in a new cartridge."],
  ["mouse","scene","左のボタンを二度クリックして、フォルダを開きます。","ひだりのぼたんをにどくりっくして、ふぉるだをひらきます。","You double-click the left button to open a folder."],
  ["mouse","use","真ん中のホイールを回すと、長い画面が上下に動きます。","まんなかのほいーるをまわすと、ながいがめんがじょうげにうごきます。","Rolling the center wheel scrolls a long page up and down."],
  ["keyboard","scene","ローマ字を打ち込んで、変換キーで漢字を選びます。","ろーまじをうちこんで、へんかんきーでかんじをえらびます。","You type romaji and press the convert key to choose kanji."],
  ["keyboard","use","たくさんの小さなキーが並んでいて、長いメールを速く書けます。","たくさんのちいさなきーがならんでいて、ながいめーるをはやくかけます。","Row upon row of small keys let you write long emails quickly."],
  ["bulb","scene","急に部屋が暗くなったので、切れたものを新しいのに替えます。","きゅうにへやがくらくなったので、きれたものをあたらしいのにかえます。","The room suddenly went dark, so you replace the burned-out one with a new one."],
  ["bulb","use","スイッチを入れると、ガラスの中が温かく光ります。","すいっちをいれると、がらすのなかがあたたかくひかります。","Flip the switch and the inside of the glass glows warmly."],
  ["phone","scene","ベルが鳴ったので急いで出て、相手の声を聞きます。","べるがなったのでいそいででて、あいてのこえをききます。","The bell rang, so you hurry to answer and hear the caller’s voice."],
  ["phone","use","番号を押してから、つながるまで呼び出し音を待ちます。","ばんごうをおしてから、つながるまでよびだしおんをまちます。","After dialing the number, you wait through the ringing tone until it connects."],
  ["sun","scene","昼間に雲が晴れると、まぶしい光が地面を温めます。","ひるまにくもがはれると、まぶしいひかりがじめんをあたためます。","When the clouds clear at midday, its dazzling light warms the ground."],
  ["sun","use","夕方になると、西の空をオレンジ色に染めて沈んでいきます。","ゆうがたになると、にしのそらをおれんじいろにそめてしずんでいきます。","In the evening it dyes the western sky orange as it sets."],
  ["cloud","scene","だんだん灰色になってきたので、もうすぐ雨が降りそうです。","だんだんはいいろになってきたので、もうすぐあめがふりそうです。","It has gradually turned gray, so it looks like rain is coming soon."],
  ["cloud","use","見上げると、動物みたいな形にゆっくり変わっていきます。","みあげると、どうぶつみたいなかたちにゆっくりかわっていきます。","Look up and it slowly shifts into shapes like animals."],
  ["snowman","scene","小枝で両腕をつけ、石で目を作って顔を完成させます。","こえだでりょううでをつけ、いしでめをつくってかおをかんせいさせます。","You add twig arms and stone eyes to finish its face."],
  ["snowman","use","暖かくなると少しずつ溶けて小さくなっていきます。","あたたかくなるとすこしずつとけてちいさくなっていきます。","As the weather warms up, it slowly melts and shrinks."],
  ["lightning","scene","遠くで光が見えてから数秒後に、ごろごろと音が響きます。","とおくでひかりがみえてからすうびょうごに、ごろごろとおとがひびきます。","A few seconds after the flash in the distance, a rumble echoes."],
  ["lightning","use","夕立のとき、危ないので高い木の下には近づきません。","ゆうだちのとき、あぶないのでたかいきのしたにはちかづきません。","During a summer storm, you stay away from tall trees because of it."],
  ["rainbow","scene","太陽の光が雨粒に当たると、遠くの空に鮮やかな帯ができます。","たいようのひかりがあまつぶにあたると、とおくのそらにあざやかなおびができます。","When sunlight hits raindrops, a vivid band forms in the distant sky."],
  ["rainbow","use","すぐに消えてしまうので、見つけたら急いで友達を呼びます。","すぐにきえてしまうので、みつけたらいそいでともだちをよびます。","It fades quickly, so when you spot one you hurry to call your friends."],
  ["wind","scene","強い日には洗濯物が大きく揺れて、帽子が飛ばされそうになります。","つよいひにはせんたくものがおおきくゆれて、ぼうしがとばされそうになります。","On a strong day laundry whips around and hats nearly blow away."],
  ["wind","use","窓を開けると、涼しい流れが部屋の中を通り抜けます。","まどをあけると、すずしいながれがへやのなかをとおりぬけます。","Open the window and a cool breeze flows straight through the room."],
  ["hat","scene","出かける前にかぶって、髪が乱れないようにします。","でかけるまえにかぶって、かみがみだれないようにします。","You put it on before going out to keep your hair neat."],
  ["hat","use","部屋に入るときは、頭から取ってフックにかけます。","へやにはいるときは、あたまからとってふっくにかけます。","When stepping indoors, you take it off your head and hang it on a hook."],
  ["glasses","scene","レンズが曇ったので、柔らかい布できれいに拭きます。","れんずがくもったので、やわらかいぬのできれいにふきます。","The lenses fogged up, so you wipe them clean with a soft cloth."],
  ["glasses","use","寝る前に外して、専用のケースにしまっておきます。","ねるまえにはずして、せんようのけーすにしまっておきます。","Before going to sleep you take them off and store them in their case."],
  ["shoe","scene","雨の中を歩いて泥がついたので、きれいに洗って乾かします。","あめのなかをあるいてどろがついたので、きれいにあらってかわかします。","After walking in the rain and getting mud on it, you wash and dry it."],
  ["shoe","use","家へ上がるときは、玄関で脱いでそろえて置きます。","いえへあがるときは、げんかんでぬいでそろえておきます。","When entering a home, you slip them off and line them up neatly at the entrance."],
  ["bag","scene","肩にかけて通勤し、必要な書類をすぐ取り出せます。","かたにかけてつうきんし、ひつようなしょるいをすぐとりだせます。","You sling it over your shoulder to commute and pull out papers easily."],
  ["bag","use","中が重くなったので、いらない荷物を机の上に出します。","なかがおもくなったので、いらないにもつをつくえのうえにだします。","It got heavy inside, so you take out the extra things onto your desk."],
  ["shirt","scene","しわを伸ばすために、着る前にアイロンをかけます。","しわをのばすために、きるまえにあいろんをかけます。","To smooth out the wrinkles, you iron it before putting it on."],
  ["shirt","use","襟の形を整えてから、袖に腕を通します。","えりのかたちをととのえてから、そでにうでをとおします。","You straighten the collar and slip your arms through the sleeves."],
  ["watch","scene","電車に遅れないよう、手首をちらっと見て時刻を確かめます。","でんしゃにおくれないよう、てくびをちらっとみてじこくをたしかめます。","So you do not miss the train, you glance at your wrist to check the time."],
  ["watch","use","電池が止まって針が動かなくなったので、店で直してもらいます。","でんちがとまってはりがうごかなくなったので、みせでなおしてもらいます。","The battery died and the hands stopped moving, so you get it fixed at a shop."]
];
export const items = [
  ...base,
  ...extraClues.map(([pictureId, variant, clue, reading, translation]) => ({
    ...base.find(card => card.id === pictureId), id: `${pictureId}-${variant}`, clue, reading, translation
  })),
  ...expandKaruta(base)
];
