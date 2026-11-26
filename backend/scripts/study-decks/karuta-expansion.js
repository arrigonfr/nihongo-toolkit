import { extraDescriptors } from "./karuta-extra.js";

// Compositional listening-clue expansion for Kikitori Karuta.
// Every Japanese clause, pure-hiragana reading, and English translation is
// explicitly authored so generated clues stay natural, unambiguous within
// their six-card set, and pass strict hiragana-reading validation.

// Semantic category frames: [id, jaPrefix, readingPrefix, enPrefix, jaSuffix, readingSuffix, enSuffix]
const FRAMES = {
  carry: [
    ["look", "今探しているのは、", "いまさがしているのは、", "What I am looking for right now is ", "ものです。", "ものです。", "."],
    ["bring", "出かける前に用意したいのは、", "でかけるまえによういしたいのは、", "Before heading out, I want to prepare ", "ものです。", "ものです。", "."],
    ["daily", "毎日の生活でよく使うのは、", "まいにちのせいかつでよくつかうのは、", "Something used often in daily life is ", "ものです。", "ものです。", "."],
    ["forget", "うっかり忘れやすいのは、", "うっかりわすれやすいのは、", "Easy to accidentally forget is ", "ものです。", "ものです。", "."],
    ["borrow", "友達にちょっと借りたいのは、", "ともだちにちょっとかりたいのは、", "What I want to borrow briefly from a friend is ", "ものです。", "ものです。", "."],
    ["buy", "今度お店で買おうと思っているのは、", "こんどおみせでかおうとおもっているのは、", "Next time at the shop, I plan to buy ", "ものです。", "ものです。", "."],
    ["hint", "ヒントを言いますね。", "ひんとをいいますね。", "Here is a hint: it is ", "ものです。", "ものです。", "."],
    ["guess", "どれのことか分かりますか。", "どれのことかわかりますか。", "Can you tell which one it is? It is ", "ものです。", "ものです。", "."],
    ["room", "机や玄関の近くにあるのは、", "つくえやげんかんのちかくにあるのは、", "Found near the desk or entrance is ", "ものです。", "ものです。", "."],
    ["handy", "一つ持っていると便利なのは、", "ひとつもっているとべんりなのは、", "Handy to have on hand is ", "ものです。", "ものです。", "."]
  ],
  animal: [
    ["picture", "絵本によく出てくるのは、", "えほんによくでてくるのは、", "Often seen in picture books is ", "生き物です。", "いきものです。", "."],
    ["nature", "自然の中で見かけるのは、", "しぜんのなかでみかけるのは、", "Spotted out in nature is ", "生き物です。", "いきものです。", "."],
    ["child", "子どもたちに人気があるのは、", "こどもたちににんきがあるのは、", "Popular with children is ", "生き物です。", "いきものです。", "."],
    ["observe", "じっと観察すると面白いのは、", "じっとかんさつするとおもしろいのは、", "Fun to watch closely is ", "生き物です。", "いきものです。", "."],
    ["hint", "ヒントを聞いてもらえますか。", "ひんとをきいてもらえますか。", "Listen to this clue: it is ", "生き物です。", "いきものです。", "."],
    ["guess", "どの絵か分かりますか。", "どのえかわかりますか。", "Can you tell which picture it is? It is ", "生き物です。", "いきものです。", "."],
    ["story", "昔話や歌にも登場するのは、", "むかしばなしやうたにもとうじょうするのは、", "Also appearing in folk tales and songs is ", "生き物です。", "いきものです。", "."],
    ["draw", "スケッチブックに描いたのは、", "すけっちぶっくにかいたのは、", "What I drew in my sketchbook is ", "生き物です。", "いきものです。", "."],
    ["park", "休みの日に見に行ったのは、", "やすみのひにみにいったのは、", "What we went to see on our day off is ", "生き物です。", "いきものです。", "."],
    ["card", "次に選ぶカードは、", "つぎにえらぶかーどは、", "The next card to pick is ", "生き物です。", "いきものです。", "."]
  ],
  food: [
    ["market", "スーパーの売り場でよく見るのは、", "すーぱーのうりばでよくみるのは、", "Often seen at the grocery store is ", "食べ物です。", "たべものです。", "."],
    ["kitchen", "台所でよく準備するのは、", "だいどころでよくじゅんびするのは、", "Often prepared in the kitchen is ", "食べ物です。", "たべものです。", "."],
    ["meal", "毎日の食事によく並ぶのは、", "まいにちのしょくじによくならぶのは、", "Often served with daily meals is ", "食べ物です。", "たべものです。", "."],
    ["snack", "おやつや軽食にも合うのは、", "おやつやけいしょくにもあうのは、", "Great for a snack or light bite is ", "食べ物です。", "たべものです。", "."],
    ["fresh", "新鮮なものを選びたいのは、", "しんせんなものをえらびたいのは、", "Something you want to pick fresh is ", "食べ物です。", "たべものです。", "."],
    ["hint", "ヒントを言いますね。", "ひんとをいいますね。", "Here is a clue: it is ", "食べ物です。", "たべものです。", "."],
    ["guess", "どれのことか当ててみてください。", "どれのことかあててみてください。", "Try guessing which one it is: ", "食べ物です。", "たべものです。", "."],
    ["shop", "買い物メモに書いたのは、", "かいものめもにかいたのは、", "Written on the shopping list is ", "食べ物です。", "たべものです。", "."],
    ["table", "テーブルの上に用意したのは、", "てーぶるのうえによういしたのは、", "Set out on the table is ", "食べ物です。", "たべものです。", "."],
    ["recipe", "料理の本によく出てくるのは、", "りょうりのほんによくでてくるのは、", "Frequently mentioned in cookbooks is ", "食べ物です。", "たべものです。", "."]
  ],
  place: [
    ["town", "町の地図でよく見かけるのは、", "まちのちずでよくみかけるのは、", "Often seen on a town map is ", "場所です。", "ばしょです。", "."],
    ["visit", "週末によく立ち寄るのは、", "しゅうまつによくたちよるのは、", "A place people often stop by on weekends is ", "場所です。", "ばしょです。", "."],
    ["nearby", "家の近くにあると助かるのは、", "いえのちかくにあるとたすかるのは、", "Helpful to have near home is ", "場所です。", "ばしょです。", "."],
    ["errand", "用事があるときに向かうのは、", "ようじがあるときにむかうのは、", "Where you head when you have an errand is ", "場所です。", "ばしょです。", "."],
    ["hint", "ヒントを言いますね。", "ひんとをいいますね。", "Here is a hint: it is ", "場所です。", "ばしょです。", "."],
    ["guess", "どの絵が合うか考えてみてください。", "どのえがあうかかんがえてみてください。", "Think about which picture fits: ", "場所です。", "ばしょです。", "."],
    ["walk", "散歩の途中で前を通るのは、", "さんぽのとちゅうでまえをとおるのは、", "A place you pass on a walk is ", "場所です。", "ばしょです。", "."],
    ["daily", "暮らしの中でよく利用するのは、", "くらしのなかでよくりようするのは、", "Frequently used in everyday life is ", "場所です。", "ばしょです。", "."],
    ["ask", "道案内でよく聞かれるのは、", "みちあんないでよくきかれるのは、", "Often asked about when giving directions is ", "場所です。", "ばしょです。", "."],
    ["card", "この問題で探すのは、", "このもんだいでさがすのは、", "For this round, look for ", "場所です。", "ばしょです。", "."]
  ],
  activity: [
    ["holiday", "休みの日に楽しむ人が多いのは、", "やすみのひにたのしむひとがおおいのは、", "Enjoyed by many people on days off is ", "ことです。", "ことです。", "."],
    ["outdoor", "自然の中で体を動かして楽しむのは、", "しぜんのなかでからだをうごかしてたのしむのは、", "An active outdoor pastime is ", "ことです。", "ことです。", "."],
    ["hobby", "趣味として続ける人がいるのは、", "しゅみとしてつづけるひとがいるのは、", "Practiced as a hobby is ", "ことです。", "ことです。", "."],
    ["season", "季節に合わせて出かける人が多いのは、", "きせつにあわせてでかけるひとがおおいのは、", "Something people head out for in season is ", "ことです。", "ことです。", "."],
    ["hint", "ヒントを聞いてもらえますか。", "ひんとをきいてもらえますか。", "Listen to this hint: it is ", "ことです。", "ことです。", "."],
    ["guess", "どれのことか分かりますか。", "どれのことかわかりますか。", "Can you tell which one it is? It is ", "ことです。", "ことです。", "."],
    ["try", "今度ぜひ挑戦してみたいのは、", "こんどぜひちょうせんしてみたいのは、", "Something I would love to try next is ", "ことです。", "ことです。", "."],
    ["friend", "友達と一緒にすると楽しいのは、", "ともだちといっしょにするとたのしいのは、", "Fun to do with friends is ", "ことです。", "ことです。", "."],
    ["morning", "朝から元気よく取り組むのは、", "あさからげんきよくとりくむのは、", "Tackled energetically from the morning is ", "ことです。", "ことです。", "."],
    ["card", "このラウンドで選ぶ絵は、", "このらうんどでえらぶえは、", "The picture to pick this round is ", "ことです。", "ことです。", "."]
  ],
  vehicle: [
    ["travel", "遠くへ移動するときに活躍するのは、", "とおくへいどうするときにかつやくするのは、", "Useful for getting around is ", "乗り物です。", "のりものです。", "."],
    ["see", "旅先や町の近くで見かけるのは、", "たびさきやまちのちかくでみかけるのは、", "Spotted in town or on trips is ", "乗り物です。", "のりものです。", "."],
    ["move", "人や荷物を運ぶのに使われるのは、", "ひとやにもつをはこぶのにつかわれるのは、", "Used to carry people or cargo is ", "乗り物です。", "のりものです。", "."],
    ["ride", "一度は乗ってみたいと思うのは、", "いちどはのってみたいとおもうのは、", "Something people want to ride at least once is ", "乗り物です。", "のりものです。", "."],
    ["hint", "ヒントを言いますね。", "ひんとをいいますね。", "Here is a hint: it is ", "乗り物です。", "のりものです。", "."],
    ["guess", "どの絵が当てはまるか選んでください。", "どのえがあてはまるかえらんでください。", "Pick the matching picture: it is ", "乗り物です。", "のりものです。", "."],
    ["picture", "乗り物の図鑑に載っているのは、", "のりもののずかんにのっているのは、", "Featured in a vehicle picture book is ", "乗り物です。", "のりものです。", "."],
    ["work", "仕事や通勤でもよく使われるのは、", "しごとやつうきんでもよくつかわれるのは、", "Often used for work or commuting is ", "乗り物です。", "のりものです。", "."],
    ["sound", "近づくと独特の音が聞こえるのは、", "ちかづくとどくとくのおとがきこえるのは、", "Approaching with its own distinct sound is ", "乗り物です。", "のりものです。", "."],
    ["card", "次の絵を選んでください。", "つぎのえをえらんでください。", "Choose the next picture: it is ", "乗り物です。", "のりものです。", "."]
  ],
  tech: [
    ["desk", "仕事や勉強の机の周りにあるのは、", "しごとやべんきょうのつくえのまわりにあるのは、", "Found around a work or study desk is ", "道具です。", "どうぐです。", "."],
    ["home", "家やオフィスでよく使われているのは、", "いえやおふぃすでよくつかわれているのは、", "Commonly used at home or the office is ", "道具です。", "どうぐです。", "."],
    ["help", "毎日の作業を楽にしてくれるのは、", "まいにちのさぎょうをらくにしてくれるのは、", "Making daily tasks easier is ", "道具です。", "どうぐです。", "."],
    ["switch", "使う前に準備してから操作するのは、", "つかうまえにじゅんびしてからそうさするのは、", "Set up and operated when needed is ", "道具です。", "どうぐです。", "."],
    ["hint", "ヒントを言いますね。", "ひんとをいいますね。", "Here is a hint: it is ", "道具です。", "どうぐです。", "."],
    ["guess", "どれのことか当ててみてください。", "どれのことかあててみてください。", "Try guessing which one it is: ", "道具です。", "どうぐです。", "."],
    ["shop", "家電量販店でよく並んでいるのは、", "かでんりょうはんてんでよくならんでいるのは、", "Lined up in electronics stores is ", "道具です。", "どうぐです。", "."],
    ["check", "調子が悪いとき確認するのは、", "ちょうしがわるいときかくにんするのは", "Something you check when it acts up is ", "道具です。", "どうぐです。", "."],
    ["daily", "現代の暮らしに欠かせないのは、", "げんだいのくらしにかかせないのは、", "Indispensable in modern life is ", "道具です。", "どうぐです。", "."],
    ["card", "この問題に合う絵は、", "このもんだいにあうえは、", "The picture matching this question is ", "道具です。", "どうぐです。", "."]
  ],
  weather: [
    ["sky", "外に出て空を見上げると分かるのは、", "そとにでてそらをみあげるとわかるのは、", "Noticeable when you step outside and look at the sky is ", "ものです。", "ものです。", "."],
    ["forecast", "天気予報のニュースでよく話題になるのは、", "てんきよほうのにゅーすでよくわだいになるのは、", "Often mentioned in weather forecasts is ", "ものです。", "ものです。", "."],
    ["season", "季節の移り変わりを感じさせるのは、", "きせつのうつりかわりをかんじさせるのは、", "Giving a sense of the changing seasons is ", "ものです。", "ものです。", "."],
    ["window", "朝、窓の外を見て気づくのは、", "あさ、まどのそとをみてきづくのは、", "Noticed when looking out the window in the morning is ", "ものです。", "ものです。", "."],
    ["hint", "ヒントを聞いてもらえますか。", "ひんとをきいてもらえますか。", "Listen to this hint: it is ", "ものです。", "ものです。", "."],
    ["guess", "どの絵が合うか分かりますか。", "どのえがあうかわかりますか。", "Can you tell which picture matches? It is ", "ものです。", "ものです。", "."],
    ["nature", "自然の景色の中で印象的なのは、", "しぜんのけしきのなかでいんしょうてきなのは、", "Memorable in natural scenery is ", "ものです。", "ものです。", "."],
    ["walk", "外を歩いているときに感じるのは、", "そとをあるいているときにかんじるのは、", "Experienced while walking outside is ", "ものです。", "ものです。", "."],
    ["photo", "思わず写真を撮りたくなるのは、", "おもわずしゃしんをとりたくなるのは、", "Making you want to snap a photo is ", "ものです。", "ものです。", "."],
    ["card", "今回のヒントに合うのは、", "こんかいのひんとにあうのは、", "Matching this round’s clue is ", "ものです。", "ものです。", "."]
  ],
  clothing: [
    ["wear", "出かける前に身につけていくのは、", "でかけるまえにみにつけていくのは、", "Put on before heading out is ", "ものです。", "ものです。", "."],
    ["closet", "玄関やクローゼットにしまってあるのは、", "げんかんやくろーぜっとにしまってあるのは、", "Kept by the entrance or in the closet is ", "ものです。", "ものです。", "."],
    ["style", "毎日の服装に合わせて選ぶのは、", "まいにちのふくそうにあわせてえらぶのは、", "Chosen to match your daily outfit is ", "ものです。", "ものです。", "."],
    ["shop", "服や小物の店で試してから買うのは、", "ふくやこもののみせでためしてからかうのは、", "Tried on before buying at a shop is ", "ものです。", "ものです。", "."],
    ["hint", "ヒントを言いますね。", "ひんとをいいますね。", "Here is a hint: it is ", "ものです。", "ものです。", "."],
    ["guess", "どれのことか当ててみてください。", "どれのことかあててみてください。", "Try guessing which one it is: ", "ものです。", "ものです。", "."],
    ["ready", "朝の身支度で手早く用意するのは、", "あさのみじたくでてばやくよういするのは、", "Quickly grabbed during your morning routine is ", "ものです。", "ものです。", "."],
    ["gift", "誕生日のプレゼントにも喜ばれるのは、", "たんじょうびのぷれぜんとにもよろこばれるのは、", "Also appreciated as a birthday gift is ", "ものです。", "ものです。", "."],
    ["clean", "長く使えるように手入れをしておくのは、", "ながくつかえるようにていれをしておくのは、", "Cared for so it lasts a long time is ", "ものです。", "ものです。", "."],
    ["card", "このヒントに合うカードは、", "このひんとにあうかーどは、", "The card matching this clue is ", "ものです。", "ものです。", "."]
  ]
};

// Per-picture descriptors: [frameType, [[key, jaClause, readingClause, enClause], ...]]
// Every descriptor uniquely identifies its picture within its six-card set.
const DESCRIPTORS = {
  umbrella: ["carry", [
    ["rain", "雨にぬれないように頭の上で広げる", "あめにぬれないようにあたまのうえでひろげる", "something opened overhead to stay dry in the rain"],
    ["handle", "持ち手が曲がっていて、雨の日にさして歩く", "もちてがまがっていて、あめのひにさしてあるく", "something with a curved handle carried open on rainy days"],
    ["fold", "雨宿りのあと、水滴を払ってたためる", "あまやどりのあと、すいてきをはらってたためる", "something you shake dry and fold up after the rain"],
    ["stand", "晴れた日には玄関の立て掛けにしまっておく", "はれたひにはげんかんのたてかけにしまっておく", "something stored upright by the front door on sunny days"],
    ["drop", "上から降ってくる雨粒をしっかり受け止める", "うえからふってくるあまつぶをしっかりうけとめる", "something that catches raindrops falling from above"]
  ]],
  clock: ["carry", [
    ["hands", "長い針と短い針が回って今の時刻を教える", "ながいはりとみじかいはりがまわっていまのじこくをおしえる", "something whose long and short hands turn to tell the time"],
    ["numbers", "丸い文字盤に一から十二までの数字が並ぶ", "まるいもじばんにいちからじゅうにまでのすうじがならぶ", "something with numbers one through twelve on a round face"],
    ["tick", "一秒ごとに静かに針を進めて時間を計る", "いちびょうごとにしずかにはりをすすめてじかんをはかる", "something that ticks forward every second to measure time"],
    ["wall", "部屋の壁に掛けて、家族みんなで時刻を確かめる", "へやのかべにかけて、かぞくみんなでじこくをたしかめる", "something hung on a wall so everyone can check the time"],
    ["late", "遅刻しないように何度も見上げて時間を確認する", "ちこくしないようになんどもみあげてじかんをかくにんする", "something you glance up at so you are not late"]
  ]],
  cup: ["carry", [
    ["coffee", "熱いコーヒーやお茶を注いで取っ手を持つ", "あついこーひーやおちゃをそそいでとってをもつ", "something with a handle for pouring hot coffee or tea"],
    ["sip", "休憩時間に温かい飲み物を少しずつ飲むための", "きゅうけいじかんにあたたかいのみものをすこしずつのむための", "something for sipping warm drinks on a break"],
    ["steam", "温かい飲み物を入れると上から湯気が立つ", "あたたかいのみものをいれるとうえからゆげがたつ", "something that steams when filled with a hot drink"],
    ["saucer", "小皿の上にのせてテーブルに出す飲み物用の", "こざらのうえにのせててーぶるにだすのみものようの", "a drinking vessel often served on a small saucer"],
    ["wash", "お茶を飲んだあとに台所で洗って伏せておく", "おちゃをのんだあとにだいどころであらってふせておく", "something washed in the kitchen after finishing tea"]
  ]],
  scissors: ["carry", [
    ["blades", "二枚の金属の刃を動かして紙や布を切る", "にまいのきんぞくのはをうごかしてかみやぬのをきる", "something with two metal blades that cuts paper or cloth"],
    ["rings", "二つの輪に指を入れて開いたり閉じたりする", "ふたつのわにゆびをいれてひらいたりとじたりする", "something you open and close by placing fingers in two rings"],
    ["craft", "工作や折り紙で紙を好きな形に切り抜く", "こうさくやおりがみでかみをすきなかたちにきりぬく", "something used in crafts to cut paper into shapes"],
    ["tag", "新しい服のタグやひもをぱちんと切る", "あたらしいふくのたぐやひもをぱちんときる", "something used to snip a clothing tag or string"],
    ["paper", "封筒や包装紙をまっすぐ切るのに役立つ", "ふうとうやほうそうしをまっすぐきるのにやくだつ", "something handy for cutting envelopes or wrapping paper straight"]
  ]],
  key: ["carry", [
    ["lock", "ドアの鍵穴に差し込んで回して開け閉めする", "どあのかぎあなにさしこんでまわしてあけしめする", "something inserted into a keyhole and turned to lock or unlock"],
    ["metal", "先端にぎざぎざの刻みがついた小さな金属の", "せんたんにぎざぎざのきざみがついたちいさなきんぞくの", "a small notched metal piece for opening a lock"],
    ["door", "家へ帰ったとき玄関を開けるために取り出す", "いえへかえったときげんかんをあけるためにとりだす", "something taken out to unlock the front door when getting home"],
    ["ring", "紛失しないようにホルダーにつけて持ち歩く", "ふんしつしないようにほるだーにつけてもちあるく", "something clipped to a holder so it does not get lost"],
    ["secure", "部屋の戸締まりをするとき必ず使う小さな", "へやのとじまりをするときかならずつかうちいさな", "something small always used to secure a room"]
  ]],
  book: ["carry", [
    ["pages", "紙のページをめくりながら物語や知識を読む", "かみのぺーじをめくりながらものがたりやちしきをよむ", "something whose paper pages you turn to read stories or facts"],
    ["bookmark", "途中で読むのをやめるときしおりを挟んでおく", "とちゅうでよむのをやめるときしおりをはさんでおく", "something you place a bookmark inside when pausing"],
    ["shelf", "背表紙を並べて棚にきれいにしまっておく", "せびょうしをならべてたなにきれいにしまっておく", "something lined up spine-out neatly on a shelf"],
    ["story", "静かな夜に表紙を開いて物語の世界を楽しむ", "しずかなよるにひょうしをひらいてものがたりのせかいをたのしむ", "something opened on a quiet night to enjoy a story"],
    ["study", "大事なところに線を引きながらじっくり読む", "だいじなところにせんをひきながらじっくりよむ", "something read carefully while underlining key lines"]
  ]],
  fish: ["animal", [
    ["swim", "ひれとしっぽを動かして水の中を自由に泳ぐ", "ひれとしっぽをうごかしてみずのなかをじゆうにおよぐ", "a creature that swims freely through water with fins and a tail"],
    ["scales", "体中にうろこがあり、えらを使って水中で息をする", "からだじゅうにうろこがあり、えらをつかってすいちゅうでいきをする", "a scaled creature that breathes underwater through gills"],
    ["sea", "海や川の中を群れになってすいすい進む", "うみやかわのなかをむれになってすいすいすすむ", "a creature gliding in schools through seas and rivers"],
    ["tank", "水族館の大きな水槽の中でひらひら泳ぐ", "すいぞくかんのおおきなすいそうのなかでひらひらおよぐ", "a creature swimming gracefully in an aquarium tank"],
    ["pond", "きれいな池の水面の下で光って見える", "きれいはないけのみずめのしたでひかってみえる", "a creature glinting beneath the surface of a clear pond"]
  ]],
  rabbit: ["animal", [
    ["ears", "ピンと立った長い耳を持ち、ぴょんぴょん跳ねる", "ぴんとたったながいみみをもち、ぴょんぴょんはねる", "a long-eared creature that hops along"],
    ["tail", "丸くて小さな白いしっぽがついた草食の", "まるくてちいさなしろいしっぽがついたそうしょくの", "a plant-eating creature with a small round white tail"],
    ["hop", "強い後ろ足で地面を蹴って軽やかに跳ぶ", "つよいうしろあしでじめんをけってかろやかにとぶ", "a creature that springs lightly on strong hind legs"],
    ["soft", "やわらかい毛に包まれて、鼻をひくひく動かす", "やわらかいけにつつまれて、はなをひくひくうごかす", "a soft-furred creature that twitches its nose"],
    ["meadow", "野原で静かに草をかじりながら辺りをうかがう", "のはらでしずかにくさをかじりながらあたりをうかがう", "a creature nibbling grass quietly in a meadow"]
  ]],
  banana: ["food", [
    ["peel", "黄色い皮を手で簡単にむいて食べる細長い", "きいろいかわをてでかんたんにむいてたべるほそながい", "a long fruit with a yellow peel you strip off by hand"],
    ["curve", "三日月のように少し曲がった甘い南国の", "みかづきのようにすこしまがったあまいなんごくの", "a sweet tropical fruit curved like a crescent"],
    ["bunch", "何本も房になって売られている柔らかい", "なんぼんもふさになってうられているやわらかい", "a soft fruit sold in bunches"],
    ["smoothie", "牛乳と一緒にミキサーで混ぜて甘い飲み物にする", "ぎゅうにゅうといっしょにみきさーでまぜてあまいのみものにする", "a fruit blended with milk into a sweet drink"],
    ["sport", "運動の合間にすぐエネルギー補給できる黄色い", "うんどうのあいまにすぐえねるぎーほきゅうできるきいろい", "a yellow fruit eaten for quick energy during exercise"]
  ]],
  carrot: ["food", [
    ["root", "土の中で育つ、先が細くなったオレンジ色の", "つちのなかでそだつ、さきがほそくなったおれんじいろの", "a tapered orange vegetable that grows underground"],
    ["stew", "輪切りにしてスープやカレーに彩りを添える", "わぎりにしてすーぷやかれーにいろどりをそえる", "a vegetable sliced into rounds to add color to soup or curry"],
    ["crunch", "生のままかじるとぽりぽりと歯ごたえがある", "なまのままかじるとぽりぽりとはごたえがある", "a crisp root vegetable that crunches when eaten raw"],
    ["leaves", "上のほうに緑色のふさふさした葉がつく", "うえのほうにみどりいろのふさふさしたはがつく", "a root vegetable topped with feathery green leaves"],
    ["salad", "千切りにしてサラダや炒め物によく使う", "せんぎりにしてさらだやいためものによくつかう", "a vegetable often shredded for salads and stir-fries"]
  ]],
  tent: ["carry", [
    ["camp", "キャンプ場でポールを立てて張る三角形の", "きゃんぷじょうでぽーるをたててはるさんかくけいの", "a triangular shelter pitched with poles at a campsite"],
    ["sleep", "野外で風や雨を防ぎながら中で眠れる", "やがいでかぜやあめをふせぎながらなかでねむれる", "a shelter you sleep inside outdoors protected from wind and rain"],
    ["zip", "布でできていて、入り口をファスナーで開閉する", "ぬのでできていて、いりぐちをふぁすなーでかいへいする", "a fabric shelter whose entrance opens and closes with a zipper"],
    ["mountain", "山や森へ泊まりがけで出かけるときに運ぶ", "やまやもりへとまりがけででかけるときにはこぶ", "something carried for an overnight stay in the mountains or woods"],
    ["pegs", "飛ばされないように地面に杭を打って固定する", "とばされないようにじめんにくいをうってこていする", "something staked to the ground with pegs so it stays put"]
  ]],
  piano: ["carry", [
    ["keys", "たくさんの白い鍵盤と黒い鍵盤が横に並ぶ", "たくさんのしろいけんばんとくろいけんばんがよこにならぶ", "an instrument with rows of white and black keys"],
    ["melody", "両手の指で鍵盤をたたいて美しい和音を奏でる", "りょうてのゆびでけんばんをたたいてうつくしいわおんをかなでる", "an instrument played with both hands to make rich chords"],
    ["hall", "コンサートの舞台や学校の音楽室に置かれる", "こんさーとのぶたいやがっこうのおんがくしつにおかれる", "an instrument placed on concert stages and in music rooms"],
    ["pedal", "足元のペダルを踏みながら音の響きを変える", "あしもとのぺだるをふみながらおとのひびきをかえる", "an instrument whose foot pedals shape the resonance"],
    ["sheet", "楽譜を見ながら両手でリズムを合わせて弾く", "がくふをみながらりょうてでりずむをあわせてひく", "an instrument played with both hands while reading sheet music"]
  ]],
  library: ["place", [
    ["borrow", "カードを見せて無料でたくさんの本を借りられる", "かーどをみせてむりょうでたくさんのほんをかりられる", "a place where you show a card to borrow books for free"],
    ["quiet", "大きな声を出さず、静かに読書や勉強ができる", "おおきなこえをださず、しずかにどくしょやべんきょうができる", "a quiet place for reading and studying without speaking loudly"],
    ["shelves", "ジャンルごとに本棚がずらりと並んでいる", "じゃんるごとにほんだながずらりとならんでいる", "a place lined with rows of bookshelves sorted by topic"],
    ["return", "読み終わった本を期限までに返しに行く", "よみおわったほんをきげんまでにかえしにいく", "a place you visit to return finished books before they are due"],
    ["desk", "調べ物をするための机や辞書がそろっている", "しらべものをするためのつくえやじしょがそろっている", "a place equipped with study desks and reference books"]
  ]],
  station: ["place", [
    ["platform", "ホームに並んで電車が到着するのを待つ", "ほーむにならんででんしゃがとうちゃくするのをまつ", "a place where you line up on a platform to wait for trains"],
    ["gate", "切符やICカードを改札に通って出入りする", "きっぷやあいしーかーどをかいさつにとおってでいりする", "a place entered through ticket gates with a ticket or IC card"],
    ["transfer", "別の路線に乗り換えるために階段を移動する", "べつのろせんにのりかえるためにかいだんをいどうする", "a place where you take stairs to transfer to another line"],
    ["commute", "朝夕にたくさんの通勤客や通学客が集まる", "あさゆうにたくさんのつうきんきゃくやつうがくきゃくがあつまる", "a place busy with commuters and students morning and evening"],
    ["exit", "東口や西口などの出口案内を見て外へ出る", "ひがしぐちやにしぐちなのでぐちあんないをみてそとへでる", "a place with east and west exit signs leading outside"]
  ]],
  post: ["place", [
    ["stamp", "窓口で切手を買ってはがきや封筒に貼る", "まどぐちできってをかってはがきやふうとうにはる", "a place where you buy stamps at the counter for letters"],
    ["parcel", "箱に詰めた荷物を遠くの住所へ発送してもらう", "はこにつめたにもつをとおくのじゅうしょへはっそうしてもらう", "a place where you ship boxed parcels to distant addresses"],
    ["envelope", "大切な書類を書留にして安全に送る", "たいせつなしょるいをかきとめにしてあんぜんにおくる", "a place to send important documents by registered mail"],
    ["scale", "手紙の重さを量って必要な料金を払う", "てがみのおもさをはかってひつようなりょうきんをはらう", "a place where letters are weighed to pay the right postage"],
    ["mark", "赤い郵便マークが目印になっていて手紙を扱っている", "あかいゆうびんまーくがめじるしになっていててがみをあつかっている", "a place marked by the red postal symbol handling mail"]
  ]],
  swimming: ["activity", [
    ["pool", "水着に着替えてプールの中を腕と足で進む", "みずぎにきがえてぷーるのなかをうでとあしですすむ", "moving through a pool with arms and legs in a swimsuit"],
    ["breath", "顔を水につけながらリズムよく息継ぎをして進む", "かおをみずにつけながらりずむよくいきつぎをしてすすむ", "gliding through water with rhythmic breathing"],
    ["waves", "水しぶきを上げながらクロールや平泳ぎで進む", "みずしぶきをあげながらくろーるやひらおよぎですすむ", "moving through water with strokes like freestyle or breaststroke"],
    ["float", "水の浮力を感じて体を伸ばしながら前に進む", "みずのふりょくをかんじてからだをのばしながらまえにすすむ", "stretching out and propelling forward using water buoyancy"],
    ["laps", "コースに沿って何往復も水の中を進み続ける", "こーすにそってなんおうふくもみずのなかをすすみつづける", "going back and forth across lanes in the water"]
  ]],
  skiing: ["activity", [
    ["slope", "両足に長い板をはいて雪の斜面を滑り降りる", "りょうあしにながいいたをはいてゆきのしゃめんをすべりおりる", "gliding down a snowy slope on long boards strapped to both feet"],
    ["poles", "両手にストックを握って雪山でバランスを取る", "りょうてにすとっくをにぎってゆきやまでばらんすをとる", "balancing on a snowy mountain with poles in both hands"],
    ["lift", "冬のゲレンデでリフトに乗って頂上から滑る", "ふゆのげれんででりふとにのってちょうじょうからすべる", "riding a winter lift and gliding down from the summit"],
    ["turn", "白い雪煙を上げながら左右に曲がって滑る", "しろいゆきけむりをあげながらさゆうにまがってすべる", "carving left and right through sprays of white snow"],
    ["winter", "寒い冬に厚手のウェアを着て雪原を滑走する", "さむいふゆにあつでのうぇあをきてせつげんをかっそうする", "gliding across snowfields in warm winter gear"]
  ]],
  fishing: ["activity", [
    ["rod", "長い竿の先に糸と針をつけて水へ垂らす", "ながいさおのさきにいとはりをつけてみずへたらす", "lowering a line and hook into the water from a long rod"],
    ["bite", "川や海のそばで静かに座り、魚がかかるのを待つ", "かわやうみのそばでしずかにすわり、さかながかかるのをまつ", "sitting quietly by a river or sea waiting for a fish to bite"],
    ["reel", "浮きが沈んだ瞬間に竿を引いて糸を巻き上げる", "うきがしずんだしゅんかんにさおをひいていとをまきあげる", "pulling the rod and reeling in the line when the bobber dips"],
    ["bait", "針にえさをつけて川の流れにゆっくり流す", "はりになえさをつけてかわのながれにゆっくりながす", "baiting a hook and letting it drift in the river current"],
    ["bucket", "釣れた魚を入れるバケツを横に置いて楽しむ", "つれたさかなをいれるばけつをよこにおいてたのしむ", "enjoying time by the water with a bucket beside you for the catch"]
  ]],
  bike: ["vehicle", [
    ["pedal", "二つの車輪があり、足でペダルをこいで走る", "ふたつのしゃりんがあり、あしでぺだるをこいではしる", "a two-wheeled vehicle powered by pedaling with your feet"],
    ["handlebar", "前のハンドルを握って曲がり、ブレーキで止まる", "まえのはんどるをにぎってまがり、ぶれーきでとまる", "a vehicle steered with handlebars and stopped with hand brakes"],
    ["bell", "ちりんちりんとベルを鳴らして細い道を走る", "ちりんちりんとべるをならしてほそいみちをはしる", "a vehicle that rings a bell along narrow streets"],
    ["saddle", "サドルにまたがり、自分の力で軽快に進む", "さどるにまたがり、じぶんのちからでけいかいにすすむ", "a vehicle you straddle on a saddle and propel yourself"],
    ["rack", "買い物かごに荷物を入れて近所まで乗っていく", "かいものかごににもつをいれてきんじょまでのっていく", "a vehicle with a basket ridden around the neighborhood"]
  ]],
  bus: ["vehicle", [
    ["stop", "決まった停留所に止まり、大勢の乗客を運ぶ", "きまったていりゅうじょにとまり、おおぜいのじょうきゃくをはこぶ", "a vehicle stopping at set stops to carry many passengers"],
    ["button", "降りたい場所が近づいたら車内のボタンを押す", "おりたいばしょがちかづいたらしゃないのぼたんをおす", "a vehicle where you press a button inside before your stop"],
    ["fare", "運転席の横で運賃を払って乗り降りする", "うんてんせきのよこでうんちんをはらってのりおりする", "a vehicle where you pay the fare beside the driver’s seat"],
    ["route", "番号や行き先を前に表示して町の道路を走る", "ばんごうやいきさきをまえにひょうじしてまちのどうろをはしる", "a road vehicle displaying its route number and destination up front"],
    ["seats", "長い車体にたくさんの座席とつり革が並んでいる", "ながいしゃたいにたくさんのざせきとつりかわがならんでいる", "a long vehicle lined with rows of seats and hand straps"]
  ]],
  plane: ["vehicle", [
    ["wings", "左右に大きな翼を広げて高い空を飛ぶ", "さゆうにおおきなつばさをひろげてたかいそらをとぶ", "a vehicle with wide wings that flies high in the sky"],
    ["runway", "空港の長い滑走路を勢いよく走って離陸する", "くうこうのながいかっそうろをいきおいよくはしってりりくする", "a vehicle that speeds down an airport runway to take off"],
    ["abroad", "海を越えて遠い外国まで速く移動できる", "うみをこえてとおいがいこくまではやくいどうできる", "a vehicle that crosses oceans quickly to distant countries"],
    ["clouds", "雲の上をまっすぐ飛んで別の都市へ向かう", "くものうえをまっすぐとんでべつのとしへむかう", "a vehicle flying straight above the clouds to another city"],
    ["seatbelt", "離陸と着陸のときにシートベルトをしっかり締める", "りりくとちゃくりくのときにしーとべるとをしっかりしめる", "a flying vehicle where you fasten your seatbelt for takeoff and landing"]
  ]],
  sailboat: ["vehicle", [
    ["sail", "大きな白い帆に風を受けて水面を進む", "おおきなしろいほにかぜをうけてすいめんをすすむ", "a craft that catches the wind in a big white sail across the water"],
    ["mast", "真ん中に高いマストが立ち、風向きに合わせて走る", "まんなかにたかいますとがたち、かざむきにあわせてはしる", "a boat with a tall central mast steered by the wind"],
    ["sea", "波の上を傾きながら静かにすべるように進む", "なみのうえをかたむきながらしずかにすべるようにすすむ", "a craft gliding quietly across ocean waves"],
    ["harbor", "晴れた日に港から出て海風を感じながら進む", "はれたひにみなとからでてうみかぜをかんじながらすすむ", "a craft leaving the harbor to ride the sea breeze"],
    ["rope", "帆の角度をロープで調整して海の上を渡る", "ほのかくどをろーぷでちょうせいしてうみのうえをわたる", "a boat whose sail angle is trimmed with ropes to cross the sea"]
  ]],
  helicopter: ["vehicle", [
    ["blades", "頭の上の大きな羽根をぐるぐる回して浮かび上がる", "あたまのうえのおおきなはねをぐるぐるまわしてうかびあがる", "an aircraft that spins overhead blades to lift into the air"],
    ["vertical", "滑走路を使わず真上に飛び立って真下に降りられる", "かっそうろをつかわずまうえにとびたってましたにおりられる", "an aircraft that takes off and lands straight up and down without a runway"],
    ["hover", "空の同じ場所にとどまって救助や撮影をする", "そらのおなじばしょにとどまってきゅうじょやさつえいをする", "an aircraft that hovers in place for rescues or filming"],
    ["rooftop", "病院や高いビルの屋上にある丸い場所へ着陸する", "びょういんやたかいびるのおくじょうにあるまるいばしょへちゃくりくする", "an aircraft landing on rooftop pads atop hospitals or towers"],
    ["rotor", "ぱたぱたと強い風を起こしながら空を飛ぶ", "ぱたぱたとつよいかぜをおこしながらそらをとぶ", "an aircraft flying while whipping up a strong downdraft"]
  ]],
  tractor: ["vehicle", [
    ["field", "畑の土を深く耕すために農場で活躍する", "はたけのつちをふかくたがやすためにのうじょうでかつやくする", "a farm vehicle used to plow soil deeply in fields"],
    ["wheels", "後ろにとても大きなごついタイヤがついている", "うしろにとてもおおきなごついたいやがついている", "a vehicle fitted with massive rugged rear tires"],
    ["farm", "広い農地で重い作業機を引いてゆっくり進む", "ひろいのうちでおもいさぎょうきをひいてゆっくりすすむ", "a vehicle pulling heavy equipment slowly across farmland"],
    ["mud", "でこぼこした土の上でも力強く走れる農業用の", "でこぼこしたつちのうえでもちからづよくはしれるのうぎょうようの", "an agricultural vehicle built to power over rough soil"],
    ["harvest", "種まきや収穫の季節に畑で毎日働く", "たねまきやしゅうかくのきせつにはたけでまいにちはたらく", "a farm machine working daily during planting and harvest"]
  ]],
  apple: ["food", [
    ["crunch", "赤い皮のままかじるとしゃきっと甘い汁が出る", "あかいかわのままかじるとしゃきっとあまいしるがでる", "a crisp red-skinned fruit that gives a sweet crunch"],
    ["pie", "薄く切って砂糖と煮てパイの中に入れる丸い", "うすくきってさとうとにてぱいのなかにいれるまるい", "a round fruit sliced and stewed with sugar for pies"],
    ["core", "真ん中に芯と小さな種があり、くし形に切って食べる", "まんなかにしんとちいさなたねがあり、くしがたにきってたべる", "a fruit with a central core and small seeds, eaten in wedges"],
    ["orchard", "秋に涼しい地域の果樹園でたくさん収穫される赤い", "あきにすずしいちいきのかじゅえんでたくさんしゅうかくされるあかい", "a red fruit harvested abundantly in cool autumn orchards"],
    ["grate", "すりおろして風邪のときに食べる甘い果物の", "すりおろしてかぜのときにたべるあまいくだものの", "a sweet fruit often grated and eaten when you have a cold"]
  ]],
  cherry: ["food", [
    ["stems", "細い軸の先に小さな赤い実が二つ並んでいる", "ほそいじくのさきにちいさなあかいみがふたつならんでいる", "tiny red fruits hanging in pairs from slender stems"],
    ["pit", "口の中で小さな硬い種を出してから味わう赤い", "くちのなかでちいさなかたいたねをだしてからあじわうあかい", "a small red fruit eaten after removing its hard little pit"],
    ["glossy", "つやつやと光る小さくて丸い初夏の果物の", "つやつやとひかるちいさくてまるいしょかのくだものの", "a tiny glossy round fruit of early summer"],
    ["dessert", "パフェやケーキの一番上に飾られる赤い実の", "ぱふぇやけーきのいちばんうえにかざられるあかいみの", "a little red fruit decorating the top of parfaits and cakes"],
    ["sweet", "一粒ずつ摘んで食べる、甘酸っぱい小さな赤い", "ひとつぶずつつまんでたべる、あまずっぱいちいさなあかい", "a sweet-tart little red fruit picked and eaten one by one"]
  ]],
  lemon: ["food", [
    ["sour", "黄色くてとてもすっぱい汁をしぼって使う", "きいろくてとてもすっぱいしるをしぼってつかう", "a bright yellow fruit squeezed for its very sour juice"],
    ["tea", "薄い輪切りにして温かい紅茶に浮かべる黄色い", "うすいわぎりにしてあたたかいこうちゃにうかべるきいろい", "a yellow citrus sliced thin and floated in hot tea"],
    ["zest", "さわやかな香りのする黄色い皮を料理に添える", "さわやかなかおりのするきいろいかわをりょうりにそえる", "a fragrant yellow citrus whose peel accents dishes"],
    ["drink", "はちみつと水を加えて夏にさっぱり飲むすっぱい", "はちみつとみずをくわえてなつにさっぱりのむすっぱい", "a sour citrus mixed with honey and water for a summer drink"],
    ["slice", "半分に切ってぎゅっとしぼると口がすぼむほどすっぱい", "はんぶんにきってぎゅっとしぼるとくちがすぼむほどすっぱい", "a citrus cut in half and squeezed, sour enough to make you pucker"]
  ]],
  egg: ["food", [
    ["shell", "硬い殻をこんこんと割ると黄身と白身が出てくる", "かたいからをこんこんとわるときみとしろみがでてくる", "something with a hard shell you crack to reveal yolk and white"],
    ["boil", "お湯でゆでて殻をむき、塩をかけて食べる丸い", "おゆでゆでてからをむき、しおをかけてたべるまるい", "something oval boiled in water, peeled, and eaten with salt"],
    ["fry", "フライパンで目玉焼きやオムレツにして朝に食べる", "ふらいぱんでめだまやきやおむれつにしてあさにたべる", "something cooked into fried eggs or omelets for breakfast"],
    ["whisk", "ボウルの中でよく溶いてお菓子作りに使う", "ぼうるのなかでよくといておかしづくりにつかう", "something beaten in a bowl for baking sweets"],
    ["carton", "割れないように専用のパックに入れて運ぶ白い", "われないようにせんようのぱっくにいれてはこぶしろい", "something fragile carried home in a protective carton"]
  ]],
  bread: ["food", [
    ["toast", "厚めに切ってトースターでこんがり焼いて食べる", "あつめにきってとーすたーでこんがりやいてたべる", "something sliced thick and toasted golden brown"],
    ["butter", "焼きたての温かい表面にバターやジャムを塗る", "やきたてのあたたかいひょうめんにばたーやじゃむをぬる", "something warm and freshly baked spread with butter or jam"],
    ["bakery", "小麦粉をこねてオーブンでふっくら焼き上げた", "こむぎこをこねておーぶんでふっくらやきあげた", "something kneaded from flour and baked fluffy in an oven"],
    ["sandwich", "二枚の間にレタスやトマトを挟んで食べる", "にまいのあいだにれたすやとまとをはさんでたべる", "something layered with lettuce and tomato for a sandwich"],
    ["crust", "外側は香ばしく、中はふわふわと柔らかい", "そとがわはこうばしく、なかはふわふわとやわらかい", "something with a savory crust and a soft fluffy inside"]
  ]],
  cheese: ["food", [
    ["melt", "牛乳から作られ、ピザの上でとろりと溶ける", "ぎゅうにゅうからつくられ、ぴざのうえでとろりととける", "a dairy food that melts smoothly on top of pizza"],
    ["wedge", "三角形に切り分けられた、コクのある乳製品の", "さんかくけいにきりわけられた、こくのあるにゅうせいひんの", "a rich dairy food cut into a triangular wedge"],
    ["gratin", "オーブンで焼くと香ばしい焼き色がつく乳製品の", "おーぶんでやくとこうばしいやきいろがつくにゅうせいひんの", "a dairy food that browns deliciously in the oven"],
    ["pasta", "細かく削ってパスタの上にたっぷり振りかける", "こまかくけずってぱすたのうえにたっぷりふりかける", "something finely grated and sprinkled generously over pasta"],
    ["cracker", "ワインやクラッカーと一緒に少しずつ味わう", "わいんやくらっかーといっしょにすこしずつあじわう", "something savored in small bites with crackers"]
  ]],
  camera: ["tech", [
    ["shutter", "レンズを向けてシャッターを押し、写真を写す", "れんずをむけてしゃったーをおし、しゃしんをうつす", "a device whose shutter you press to take photographs"],
    ["lens", "丸いレンズでピントを合わせて景色を切り取る", "まるいれんずでぴんとをあわせてけしきをきり取る".replace("取る","とる"), "a device that focuses a round lens to frame a scene"],
    ["memory", "旅行や記念日の場面を写真に残しておくための", "りょこうやきねんびのばめんをしゃしんにのこしておくための", "a device for capturing trips and special occasions in photos"],
    ["strap", "首から下げて歩き、いい風景を見つけたら構える", "くびからさげてあるき、いいふうけいをみつけたらかまえる", "a device worn around the neck ready for a great view"],
    ["flash", "暗い場所ではフラッシュをたいて人を写す", "くらいばしょではふらっしゅをたいてひとをうつす", "a device that fires a flash to photograph people in low light"]
  ]],
  printer: ["tech", [
    ["paper", "パソコンのデータを白い紙に文字や絵として出す", "ぱそこんのでーたをしろいかみにもじやえとしてだす", "a machine that outputs computer files onto white paper"],
    ["ink", "インクやトナーを使って書類をきれいに刷り上げる", "いんくやとなーをつかってしょるいをきれいにすりあげる", "a machine using ink or toner to produce crisp documents"],
    ["tray", "下のトレイにA4用紙を補充してから印刷する", "したのとれいにえーよんようしをほじゅうしてからいんさつする", "a machine you load with paper in the bottom tray before printing"],
    ["jam", "紙が詰まらないようにそろえてから出力する", "かみがつまらないようにそろえてからしゅつりょくする", "a machine you align paper for so pages do not jam"],
    ["handout", "会議の資料や地図を紙の束にして出す", "かいぎのしりょうやちずをかみのたばにしてだす", "a machine that turns meeting handouts or maps into paper copies"]
  ]],
  mouse: ["tech", [
    ["cursor", "机の上で滑らせると画面の矢印が動く", "つくえのうえですべらせるとがめんのやじるしがうごく", "a device slid across a desk to move the on-screen arrow"],
    ["click", "手のひらに載せて指先でカチッとクリックする", "てのひらにのせてゆびさきでかちっとくりっくする", "a handheld device you click with your fingertips"],
    ["wheel", "真ん中の小さな輪を回して画面を上下に送る", "まんなかのちいさなわをまわしてがめんをじょうげにおくる", "a device with a center wheel for scrolling up and down"],
    ["drag", "ボタンを押したまま動かしてファイルを運ぶ", "ぼたんをおしたままうごかしてふぁいるをはこぶ", "a device you hold and drag to move files on screen"],
    ["pad", "パソコンの横に置いて片手で操作する小さな", "ぱそこんのよこにおいてかたてでそうさするちいさな", "a small device kept beside a computer for one-handed pointing"]
  ]],
  keyboard: ["tech", [
    ["type", "たくさんの文字キーを指で押して文章を打つ", "たくさんのもじきーをゆびでおしてぶんしょうをうつ", "a board full of letter keys pressed to type text"],
    ["enter", "打ち終わったらエンターキーを押して確定する", "うちおわったらえんたーきーをおしてかくていする", "a typing board where you press Enter to confirm"],
    ["hands", "パソコンの前に置いて両手の指を並べて使う", "ぱそこんのまえにおいてりょうてのゆびをならべてつかう", "an input board placed in front of a computer for both hands"],
    ["space", "下の長いキーを押して変換や空白を入れる", "したのながいきーをおしてへんかんやくうはくをいれる", "a board with a long bottom bar for spaces or conversion"],
    ["keys", "カタカタと軽快な音を立てて文字を入力する", "かたかたとけいかいなおとをたててもじをにゅうりょくする", "a device that clacks lightly as you enter text"]
  ]],
  bulb: ["tech", [
    ["socket", "天井のソケットにくるくる回して取り付ける丸い", "てんじょうのそけっとにくるくるまわしてとりつけるまるい", "a round glass lamp screwed into a ceiling socket"],
    ["glow", "電気を通すとガラスの中がパッと光って部屋を照らす", "でんきをとおすとがらすのなかがぱっとひかってへやをてらす", "a glass lamp that glows to light up a room when powered"],
    ["replace", "切れて点かなくなったら新しいものと交換する", "きれてつかなくなったらあたらしいものとこうかんする", "a lamp replaced with a new one once it burns out"],
    ["bright", "暗い夜にスイッチ一つで周囲を明るくする", "くらいよるにすいっちひとつでしゅういをあかるくする", "something that brightens the surroundings at the flip of a switch"],
    ["lamp", "電気スタンドの傘の中で光っているガラス製の", "でんきすたんどのかさのなかでひかっているがらすせいの", "a glass light glowing inside a lamp shade"]
  ]],
  phone: ["tech", [
    ["receiver", "受話器を耳に当てて離れた人とリアルタイムで話す", "じゅわきをみみにあててはなれたひととりあるたいむではなす", "a device whose receiver you hold to your ear to talk live"],
    ["ring", "呼び出し音が鳴ったらすぐに取ってあいさつする", "よびだしおんがなったらすぐにとってあいさつする", "a device you pick up to greet someone when it rings"],
    ["number", "相手の番号を押して遠くへ声をつなげる", "あいてのばんごうをおしてとおくへこえをつなげる", "a device where you dial a number to connect your voice afar"],
    ["call", "急ぎの用事があるとき声を直接伝えられる", "いそぎのようじがあるときこえをちょくせつつたえられる", "a device for delivering your voice directly in a hurry"],
    ["talk", "もしもしと声をかけて会話を始めるための", "もしもしとこえをかけてかいわをはじめるための", "a device used to start a call by saying moshi-moshi"]
  ]],
  sun: ["weather", [
    ["morning", "朝に東から昇り、昼の空でまぶしく輝く", "あさにひがしからのぼり、ひるのそらでまぶしくかがやく", "what rises in the east each morning and shines brightly at noon"],
    ["warm", "強い光と熱で地球や地面をぽかぽか温める", "つよいひかりとねつでちきゅうやじめんをぽかぽかあたためる", "what warms the earth and ground with bright light and heat"],
    ["sunset", "夕方に西へ沈みながら空を赤く染める", "ゆうがたににしへしずみながらそらをあかくそめる", "what dyes the sky red while setting in the west at dusk"],
    ["shadow", "晴れた日に建物の後ろにくっきりした影を作る", "はれたひにたてもののうしろにくっきりしたかげをつくる", "what casts sharp shadows behind buildings on clear days"],
    ["dry", "洗濯物を外に干すとからっと乾かしてくれる", "せんたくものをそとにほすとからっとかわかしてくれる", "what dries laundry crisp and warm outdoors"]
  ]],
  cloud: ["weather", [
    ["float", "白い綿のような形で青空の上をふわりと漂う", "しろいわたのようなかたちであおぞらのうえをふわりとただよう", "what drifts like white cotton across the blue sky"],
    ["gray", "厚く広がって灰色になると雨を降らせることがある", "あつくひろがってはいいろになるとあめをふらせることがある", "what turns thick and gray and can bring rain"],
    ["shape", "風に乗って少しずつ形を変えながら空を流れる", "かぜにのってすこしずつかたちをかえながらそらをながれる", "what drifts across the sky slowly changing shape in the wind"],
    ["shade", "太陽の前に重なると地面に涼しい影を落とす", "たいようのまえにかさなるとじめんにすずしいかげをおとす", "what casts cool shade when passing in front of the sun"],
    ["plane", "飛行機で高く上がると窓の下に白く広がる", "ひこうきでたかくあがるとまどのしたにしろくひろがる", "what stretches out white below an airplane window"]
  ]],
  snowman: ["weather", [
    ["balls", "丸めた白い雪を二つ重ねて冬に作る人形のような", "まるめたしろいゆきをふたつかさねてふゆにつくるにんぎょうのような", "a winter figure made by stacking two rolled snowballs"],
    ["winter", "雪がたくさん積もった日に子どもたちが庭で作る", "ゆきがたくさんつもったひにこどもたちがにわでつくる", "something children build in the yard after heavy snowfall"],
    ["melt", "晴れて暖かくなるとだんだん溶けて小さくなる", "はれてあたたかくなるとだんだんとけてちいさくなる", "something that gradually melts away when the sun warms it"],
    ["face", "石で目をつけて小枝の腕を差した冬の飾りの", "いしでめをつけてこえだのうでをさしたふゆのかざりの", "a winter figure given stone eyes and twig arms"],
    ["scarf", "首の周りにマフラーを巻いて飾ることもある白い", "くびのまわりにまふらーをまいてかざることもあるしろい", "a white snow figure sometimes decorated with a scarf"]
  ]],
  lightning: ["weather", [
    ["flash", "暗い嵐の空を一瞬で明るく裂く鋭い光の", "くらいあらしのそらをいっしゅんであかるくさくするどいひかりの", "a sharp flash of light splitting a dark stormy sky"],
    ["thunder", "ぴかっと光った直後にごろごろと大きな音が鳴る", "ぴかっとひかったちょくごにごろごろとおおきなおとがなる", "a flash followed by a loud rolling rumble"],
    ["storm", "激しい夕立や嵐の日に空から地面へ落ちる", "はげしいゆうだちやあらしのひにそらからじめんへおちる", "something striking from sky to ground in a fierce storm"],
    ["zigzag", "ギザギザの稲妻の形をしていてとても危険な", "ぎざぎざのいなずまのかたちをしていてとてもきけんな", "a dangerous jagged bolt flashing in a thunderstorm"],
    ["shelter", "鳴り始めたら建物の中へ避難したほうがよい", "なりはじめたらたてもののなかへひなんしたほうがよい", "something that warns you to take shelter indoors"]
  ]],
  rainbow: ["weather", [
    ["seven", "雨上がりの空に七色の美しいアーチを描く", "あめあがりのそらになないろのうつくしいあーちをえがく", "a beautiful seven-colored arch across the sky after rain"],
    ["bridge", "遠くの山の向こうまで色の帯が橋のように架かる", "とおくのやまのむこうまでいろのおびがはしのようにかかる", "a band of colors arching like a bridge over distant hills"],
    ["after", "雨がやんで太陽が顔を出したときに現れる", "あめがやんでたいようがかおをだしたときにあらわれる", "something appearing when rain stops and the sun peeks out"],
    ["fade", "しばらく空に出たあと静かに薄れて消えていく", "しばらくそらにでたあとしずかにうすれてきえていく", "something that shines briefly in the sky then softly fades"],
    ["colors", "赤から紫まで色が順番に並んで見える光の", "あかからむらさきまでいろがじゅんばんにならんでみえるひかりの", "an arc of light displaying colors ordered from red to violet"]
  ]],
  wind: ["weather", [
    ["leaves", "目には見えないのに木の葉をざわざわ揺らす", "めにはみえないのにこのはをざわざわゆらす", "an invisible force rustling the leaves on trees"],
    ["breeze", "暑い日に頬をなでて涼しさを運んでくれる", "あついひにほおをなでてすずしさをはこんでくれる", "something brushing your cheek to bring coolness on a hot day"],
    ["gust", "強く吹くと傘がひっくり返りそうになる", "つよくふくとおおかさがひっくりかえりそうになる".replace("おおかさ","かさ"), "something that can flip an umbrella inside out when strong"],
    ["flags", "旗やカーテンをひらひらと大きく動かす空気の", "はたやかーてんをひらひらとおおきくうごかすくうきの", "moving air that makes flags and curtains flutter"],
    ["kite", "春の野原で凧を高く空へ舞い上げる", "はるのはらでたこをたかくそらへまいあげる", "what lifts a kite high into the sky over a spring field"]
  ]],
  hat: ["clothing", [
    ["head", "強い日差しや寒さから守るために頭にかぶる", "つよいひざしやさむさからまもるためにあたまにかぶる", "something worn on the head against strong sun or cold"],
    ["brim", "ぐるりとつばがついていて顔に影を作ってくれる", "ぐるりとつばがついていてかおにかげをつくってくれる", "something with a brim that shades your face"],
    ["indoors", "建物や部屋に入るときは頭から外して持つ", "たてものやへやにはいるときはあたまからはずしてもつ", "something taken off your head when stepping indoors"],
    ["wind", "外で飛ばされないように手で押さえることもある", "そとでとばされないようにてでおさえることもある", "something you hold onto when a strong gust blows"],
    ["summer", "夏の外出や散歩のときに熱中症対策でかぶる", "なつのがいしゅつやさんぽのときにねっちゅうしょうたいさくでかぶる", "something worn on summer walks to guard against the sun"]
  ]],
  glasses: ["clothing", [
    ["eyes", "視力を助けるために二つのレンズを目の前にかける", "しりょくをたすけるためにふたつのれんずをめのまえにかける", "two lenses worn over the eyes to help you see clearly"],
    ["board", "黒板の小さな文字をはっきり読むためにかける", "こくばんのちいさなもじをはっきりよむためにかける", "something put on to read small writing on a board clearly"],
    ["nose", "鼻と両耳で支えて顔にフィットさせる", "はなとりょうみみでささえてかおにふぃっとさせる", "something resting on your nose and ears"],
    ["case", "レンズに傷がつかないよう使わないときはケースに入れる", "れんずにきずがつかないようつかわないときはけーすにいれる", "something kept in a protective case so the lenses do not scratch"],
    ["fog", "温かいラーメンを食べるとレンズが白く曇る", "あたたかいらーめんをたべるとれんずがしろくくもる", "something whose lenses fog up over hot ramen"]
  ]],
  shoe: ["clothing", [
    ["foot", "外を歩くときに足を保護するために履く", "そとをあるくときにあしをほごするためにはく", "something worn on your foot to protect it when walking outside"],
    ["laces", "玄関で足を入れてからひもをきゅっと結ぶ", "げんかんであしをいれてからひもをきゅっとむすぶ", "something you slip your foot into and lace up at the entrance"],
    ["pair", "左右一組になっていて走るのにも散歩にも使う", "さゆうひとくみになっていてはしるのにもさんぽにもつかう", "something worn in left-and-right pairs for walking or running"],
    ["sole", "底がしっかりしていて石や雨から足を守る", "そこがしっかりしていていしやあめからあしをまもる", "something with a sturdy sole shielding your foot from stones and rain"],
    ["genkan", "家へ上がるときに必ず脱いで並べておく", "いえへあがるときにかならずぬいでならべておく", "something always slipped off and lined up when entering a home"]
  ]],
  bag: ["clothing", [
    ["carry", "財布やノート、鍵などを入れて持ち運ぶための", "さいふやのーと、かぎなどをいれてもちはこぶための", "something for carrying a wallet, notebooks, and keys"],
    ["shoulder", "肩にかけたり手で持ったりして通勤や通学に使う", "かたにかけたりてでもったりしてつうきんやつうがくにつかう", "something carried by hand or over the shoulder for commuting"],
    ["pocket", "中や外にポケットがついていて小物を整理できる", "なかやそとにぽけっとがついていてこものをせいりできる", "something with pockets to keep small items organized"],
    ["pack", "旅行や外出の前に必要な荷物をまとめて詰める", "りょこうやがいしゅつのまえにひつようなにもつをまとめてつめる", "something you pack with essentials before a trip or outing"],
    ["clasp", "中身が落ちないように口をしっかり閉じて歩く", "なかみがおちないようにくちをしっかりとしめてあるく", "something closed securely so nothing falls out while walking"]
  ]],
  shirt: ["clothing", [
    ["buttons", "前のボタンを上から順番に留めて着る襟付きの", "まえのぼたんをうえからじゅんばんにとめてきるえりつきの", "a collared top fastened from top to bottom with buttons"],
    ["sleeves", "両腕を袖に通して上半身に着る", "りょううでをそでにとおしてじょうはんしんにきる", "a garment worn on the upper body by slipping arms through sleeves"],
    ["iron", "洗濯したあと襟や身ごろにアイロンをかけて整える", "せんたくしたあとえりやみごろにあいろんをかけてととのえる", "a top ironed neatly around the collar and body after washing"],
    ["hanger", "しわにならないようにハンガーに掛けてしまっておく", "しわにならないようにはんがーにかけてしまっておく", "a garment hung on a hanger to keep it wrinkle-free"],
    ["collar", "首元にすっきりした襟があり仕事にも普段にも着る", "くびもとにすっきりしたえりがありしごとにもふだんにもきる", "a neat collared garment worn for work or everyday life"]
  ]],
  watch: ["clothing", [
    ["wrist", "ベルトを手首に巻いていつでも時刻を確かめる", "べるとをてくびにまいていつでもじこくをたしかめる", "something strapped to your wrist to check the time anytime"],
    ["glance", "携帯を出さずに腕を少し上げて時間を見るための", "けいたいをださずにうでをすこしあげてじかんをみるための", "something you check by lifting your arm without pulling out a phone"],
    ["strap", "腕の太さに合わせてベルトの穴を留めて着ける", "うでのふとさにあわせてべるとのあなをとめてつける", "something fastened to fit your wrist with a strap"],
    ["exam", "試験会場や外出先で残り時間を静かに確認する", "しけんかいじょうやがいしゅつさきでのこりじかんをしずかにかくにんする", "something worn to quietly check remaining time during exams or outings"],
    ["dial", "手首の小さな文字盤で針の動きを見ながら行動する", "てくびのちいさなもじばんではりのうごきをみながらこうどうする", "a small wrist dial watched to stay on schedule"]
  ]]
};

export function expandKaruta(baseItems) {
  const byId = Object.fromEntries(baseItems.map(item => [item.id, item]));
  const expanded = [];
  const allDescriptors = { ...DESCRIPTORS, ...extraDescriptors };
  for (const [pictureId, [frameType, descriptors]] of Object.entries(allDescriptors)) {
    const base = byId[pictureId];
    const frames = FRAMES[frameType];
    if (!base || !frames) continue;
    for (const [fKey, jaPre, rPre, enPre, jaSuf, rSuf, enSuf] of frames) {
      for (const [dKey, jaMid, rMid, enMid] of descriptors) {
        expanded.push({
          ...base,
          id: `${pictureId}-${fKey}-${dKey}`,
          clue: `${jaPre}${jaMid}${jaSuf}`,
          reading: `${rPre}${rMid}${rSuf}`,
          translation: `${enPre}${enMid}${enSuf}`
        });
      }
    }
  }
  return expanded;
}
