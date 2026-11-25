// Each frame specifies its own meaning and answer; substitutions are limited
// to nouns that work in every frame in that group.
import * as vocabulary from "./particle-vocabulary.js";
const people = [
  ["兄","あに","my older brother"], ["姉","あね","my older sister"],
  ["弟","おとうと","my younger brother"], ["妹","いもうと","my younger sister"],
  ["父","ちち","my father"], ["母","はは","my mother"],
  ["祖父","そふ","my grandfather"], ["祖母","そぼ","my grandmother"],
  ["友達","ともだち","my friend"], ["同僚","どうりょう","my colleague"]
];
const objects = [
  ["辞書","じしょ","dictionary"], ["ノート","のーと","notebook"],
  ["傘","かさ","umbrella"], ["時計","とけい","watch"],
  ["鍵","かぎ","key"], ["帽子","ぼうし","hat"],
  ["かばん","かばん","bag"], ["カメラ","かめら","camera"],
  ["地図","ちず","map"], ["切符","きっぷ","ticket"]
];
const places = [
  ["図書館","としょかん","library"], ["駅","えき","station"],
  ["公園","こうえん","park"], ["学校","がっこう","school"],
  ["博物館","はくぶつかん","museum"], ["美術館","びじゅつかん","art museum"],
  ["空港","くうこう","airport"], ["ホテル","ほてる","hotel"],
  ["喫茶店","きっさてん","coffee shop"], ["病院","びょういん","hospital"]
];
const times = [
  ["一時","いちじ","one"], ["二時","にじ","two"], ["三時","さんじ","three"],
  ["四時","よじ","four"], ["五時","ごじ","five"], ["六時","ろくじ","six"],
  ["七時","しちじ","seven"], ["八時","はちじ","eight"], ["九時","くじ","nine"],
  ["十時","じゅうじ","ten"]
];
const foods = [
  ["りんご","りんご","apples"], ["バナナ","ばなな","bananas"],
  ["みかん","みかん","mandarins"], ["パン","ぱん","bread"],
  ["卵","たまご","eggs"], ["チーズ","ちーず","cheese"],
  ["ケーキ","けーき","cake"], ["トマト","とまと","tomatoes"],
  ["じゃがいも","じゃがいも","potatoes"], ["人参","にんじん","carrots"]
];
people.push(...vocabulary.people);
objects.push(...vocabulary.objects);
places.push(...vocabulary.places);
times.push(...vocabulary.times);
foods.push(...vocabulary.foods);

const frames = [
  {
    role: "topic", words: people, patterns: [
      ["busy-topic", "You are already talking about this person. Say they are busy today.", "|今日は忙しいです。", "|きょうはいそがしいです。", "は", e => `As for ${e}, they are busy today.`, "は keeps the person as the topic."],
      ["busy-subject", "Someone asks who is busy today. Identify this person.", "|今日は忙しいです。", "|きょうはいそがしいです。", "が", e => `It is ${e} who is busy today.`, "が identifies the person who answers the question."],
      ["arrived-subject", "Someone asks who arrived first. Identify this person.", "|最初に着きました。", "|さいしょにつきました。", "が", e => `It was ${e} who arrived first.`, "が identifies the person who arrived first."],
      ["reads-topic", "This person is the established topic. Say they read every day.", "|毎日本を読みます。", "|まいにちほんをよみます。", "は", e => `${e} reads every day.`, "は marks the person as the established topic."],
      ["reads-subject", "Someone asks who reads every day. Identify this person.", "|毎日本を読みます。", "|まいにちほんをよみます。", "が", e => `It is ${e} who reads every day.`, "が identifies the person who reads."],
      ["came-subject", "Someone asks who came yesterday. Identify this person.", "|昨日来ました。", "|きのうきました。", "が", e => `It was ${e} who came yesterday.`, "が marks the person being identified."],
      ["came-topic", "This person is already the topic. Say they came yesterday.", "|昨日来ました。", "|きのうきました。", "は", e => `${e} came yesterday.`, "は keeps the person as the topic."]
    ]
  },
  {
    role: "object", words: objects, patterns: [
      ["buy", "Mark the thing you bought as the direct object, without implying an addition.", "|昨日買いました。", "|きのうかいました。", "を", e => `I bought the ${e} yesterday.`, "を marks the thing purchased."],
      ["find", "Mark the thing you found as the direct object.", "|やっと見つけました。", "|やっとみつけました。", "を", e => `I finally found the ${e}.`, "を marks the thing found."],
      ["forget", "Mark the thing you forgot as the direct object.", "|家に忘れました。", "|いえにわすれました。", "を", e => `I left the ${e} at home.`, "を marks what was forgotten."],
      ["look", "Mark the thing you are looking for as the direct object.", "|探しています。", "|さがしています。", "を", e => `I am looking for the ${e}.`, "を marks what you are searching for."],
      ["bring", "Mark the thing you brought as the direct object.", "|持ってきました。", "|もってきました。", "を", e => `I brought the ${e}.`, "を marks the thing brought."],
      ["choose", "Mark the thing you chose as the direct object.", "|選びました。", "|えらびました。", "を", e => `I chose the ${e}.`, "を marks what was chosen."],
      ["use", "Mark the thing you used as the direct object.", "|使いました。", "|つかいました。", "を", e => `I used the ${e}.`, "を marks what was used."]
    ]
  },
  {
    role: "place", words: places, patterns: [
      ["go", "Mark the destination of your trip. Either direction or endpoint is acceptable.", "|行きます。", "|いきます。", "にへ", e => `I am going to the ${e}.`, "に marks the endpoint; へ marks the direction."],
      ["go-tomorrow", "Say where you are going tomorrow. Either direction or endpoint is acceptable.", "|明日行きます。", "|あしたいきます。", "にへ", e => `I am going to the ${e} tomorrow.`, "に marks the endpoint; へ marks the direction."],
      ["arrive", "Mark the destination where you arrived.", "|着きました。", "|つきました。", "に", e => `I arrived at the ${e}.`, "に marks the destination reached with 着く."],
      ["meet", "Mark the location where you meet your friend.", "|友達と会います。", "|ともだちとあいます。", "で", e => `I meet my friend at the ${e}.`, "で marks where the meeting takes place."],
      ["wait", "Mark the location where you wait for your friend.", "|友達を待ちます。", "|ともだちをまちます。", "で", e => `I wait for my friend at the ${e}.`, "で marks where the waiting takes place."],
      ["see", "Mark the location where you saw your teacher.", "|先生を見かけました。", "|せんせいをみかけました。", "で", e => `I saw my teacher at the ${e}.`, "で marks where you saw the teacher."],
      ["meet-yesterday", "Mark the location where you met your friend yesterday.", "|昨日友達と会いました。", "|きのうともだちとあいました。", "で", e => `I met my friend at the ${e} yesterday.`, "で marks the location of the meeting."]
    ]
  },
  {
    role: "time", words: times, patterns: [
      ["wake", "Give the exact time you wake up.", "|起きます。", "|おきます。", "に", e => `I wake up at ${e} o'clock.`, "に marks the time point."],
      ["leave", "Give the exact time you leave home.", "|家を出ます。", "|いえをでます。", "に", e => `I leave home at ${e} o'clock.`, "に marks the time point."],
      ["meet", "Give the exact time you meet your friend.", "|友達と会います。", "|ともだちとあいます。", "に", e => `I meet my friend at ${e} o'clock.`, "に marks the time of the meeting."],
      ["study-from", "Mark the time when you start studying.", "|勉強します。", "|べんきょうします。", "から", e => `I study from ${e} o'clock.`, "から marks the beginning of the study period."],
      ["study-until", "Mark the time when you stop studying.", "|勉強します。", "|べんきょうします。", "まで", e => `I study until ${e} o'clock.`, "まで marks the end of the study period."],
      ["wait-from", "Mark the time when you start waiting.", "|待ちます。", "|まちます。", "から", e => `I wait from ${e} o'clock.`, "から marks the beginning of the waiting period."],
      ["wait-until", "Mark the time when you stop waiting.", "|待ちます。", "|まちます。", "まで", e => `I wait until ${e} o'clock.`, "まで marks the end of the waiting period."]
    ]
  },
  {
    role: "list", words: foods, patterns: [
      ["buy-too", "You bought milk. Add that you bought this item too.", "|買いました。", "|かいました。", "も", e => `I bought ${e} too.`, "も adds this item to the purchase already mentioned."],
      ["prepare-too", "You prepared milk. Add that you prepared this item too.", "|用意しました。", "|よういしました。", "も", e => `I prepared ${e} too.`, "も adds this item to what was already prepared."],
      ["bring-too", "You brought milk. Add that you brought this item too.", "|持ってきました。", "|もってきました。", "も", e => `I brought ${e} too.`, "も adds this item to what was already brought."],
      ["choose-too", "You chose milk. Add that you chose this item too.", "|選びました。", "|えらびました。", "も", e => `I chose ${e} too.`, "も adds this item to the earlier choice."],
      ["buy-examples", "Give this item and milk as examples of things you bought, not a complete list.", "|牛乳などを買いました。", "|ぎゅうにゅうなどをかいました。", "や", e => `I bought things such as ${e} and milk.`, "や introduces examples, reinforced by など."],
      ["prepare-examples", "Give this item and milk as examples of things you prepared.", "|牛乳などを用意しました。", "|ぎゅうにゅうなどをよういしました。", "や", e => `I prepared things such as ${e} and milk.`, "や introduces examples rather than a complete list."],
      ["buy-both", "Name exactly this item and milk as the two things you bought.", "|牛乳を買いました。", "|ぎゅうにゅうをかいました。", "と", e => `I bought ${e} and milk.`, "と joins the two items in the stated list."]
    ]
  }
];

frames[0].patterns.push(
  ["works-topic", "This person is the established topic. Say they work at a hospital.", "|病院で働いています。", "|びょういんではたらいています。", "は", e => `${e} works at a hospital.`, "は keeps the person as the topic."],
  ["works-subject", "Someone asks who works at the hospital. Identify this person.", "|病院で働いています。", "|びょういんではたらいています。", "が", e => `It is ${e} who works at the hospital.`, "が identifies the person who works there."],
  ["cooks-topic", "This person is the established topic. Say they cook dinner.", "|夕食を作ります。", "|ゆうしょくをつくります。", "は", e => `${e} makes dinner.`, "は marks the person as the topic."],
  ["cooks-subject", "Someone asks who makes dinner. Identify this person.", "|夕食を作ります。", "|ゆうしょくをつくります。", "が", e => `It is ${e} who makes dinner.`, "が identifies the person who makes dinner."],
  ["walks-topic", "This person is the established topic. Say they walk every morning.", "|毎朝歩きます。", "|まいあさあるきます。", "は", e => `${e} walks every morning.`, "は keeps the person as the topic."],
  ["walks-subject", "Someone asks who walks every morning. Identify this person.", "|毎朝歩きます。", "|まいあさあるきます。", "が", e => `It is ${e} who walks every morning.`, "が identifies the person who walks."],
  ["called-topic", "This person is already the topic. Say they called yesterday.", "|昨日電話しました。", "|きのうでんわしました。", "は", e => `${e} called yesterday.`, "は keeps the person as the topic."],
  ["called-subject", "Someone asks who called yesterday. Identify this person.", "|昨日電話しました。", "|きのうでんわしました。", "が", e => `It was ${e} who called yesterday.`, "が identifies the caller."],
  ["waiting-topic", "This person is already the topic. Say they are waiting outside.", "|外で待っています。", "|そとでまっています。", "は", e => `${e} is waiting outside.`, "は keeps the person as the topic."],
  ["waiting-subject", "Someone asks who is waiting outside. Identify this person.", "|外で待っています。", "|そとでまっています。", "が", e => `It is ${e} who is waiting outside.`, "が identifies the person waiting."]
);
frames[1].patterns.push(
  ["show", "Mark the thing you showed your friend as the direct object.", "|友達に見せました。", "|ともだちにみせました。", "を", e => `I showed the ${e} to my friend.`, "を marks what was shown; に marks the recipient."],
  ["lend", "Mark the thing you lent your friend as the direct object.", "|友達に貸しました。", "|ともだちにかしました。", "を", e => `I lent the ${e} to my friend.`, "を marks what was lent; に marks the recipient."],
  ["borrow", "Mark the thing you borrowed from your friend as the direct object.", "|友達に借りました。", "|ともだちにかりました。", "を", e => `I borrowed the ${e} from my friend.`, "を marks what was borrowed."],
  ["return", "Mark the thing you returned to your friend as the direct object.", "|友達に返しました。", "|ともだちにかえしました。", "を", e => `I returned the ${e} to my friend.`, "を marks what was returned."],
  ["receive", "Mark the thing you received from your friend as the direct object.", "|友達にもらいました。", "|ともだちにもらいました。", "を", e => `I received the ${e} from my friend.`, "を marks what was received."],
  ["check", "Mark the thing you checked as the direct object.", "|もう一度確認しました。", "|もういちどかくにんしました。", "を", e => `I checked the ${e} again.`, "を marks what was checked."],
  ["put-away", "Mark the thing you put away as the direct object.", "|片付けました。", "|かたづけました。", "を", e => `I put away the ${e}.`, "を marks what was put away."],
  ["bring-request", "Ask someone to bring the item, marking it as the direct object.", "|持ってきてください。", "|もってきてください。", "を", e => `Please bring the ${e}.`, "を marks what the person should bring."],
  ["search-request", "Ask someone to look for the item, marking it as the direct object.", "|探してください。", "|さがしてください。", "を", e => `Please look for the ${e}.`, "を marks what the person should look for."],
  ["take-home", "Mark the thing you took home as the direct object.", "|家に持って帰りました。", "|いえにもってかえりました。", "を", e => `I took the ${e} home.`, "を marks what was taken home."]
);
frames[2].patterns.push(
  ["go-together", "Name the destination you are going to with a friend. Direction or endpoint is acceptable.", "|友達と行きます。", "|ともだちといきます。", "にへ", e => `I am going to the ${e} with a friend.`, "に marks the destination and へ its direction."],
  ["go-yesterday", "Name the destination you went to yesterday. Direction or endpoint is acceptable.", "|昨日行きました。", "|きのういきました。", "にへ", e => `I went to the ${e} yesterday.`, "に marks the destination and へ its direction."],
  ["go-again", "Name the destination you will go to again. Direction or endpoint is acceptable.", "|また行きます。", "|またいきます。", "にへ", e => `I will go to the ${e} again.`, "に marks the destination and へ its direction."],
  ["arrive-together", "Mark the destination where you arrived with your friend.", "|友達と着きました。", "|ともだちとつきました。", "に", e => `I arrived at the ${e} with my friend.`, "に marks the destination reached."],
  ["arrive-yesterday", "Mark the destination where you arrived yesterday.", "|昨日着きました。", "|きのうつきました。", "に", e => `I arrived at the ${e} yesterday.`, "に marks the destination reached."],
  ["wait-yesterday", "Mark the place where you waited for your friend yesterday.", "|昨日友達を待ちました。", "|きのうともだちをまちました。", "で", e => `I waited for my friend at the ${e} yesterday.`, "で marks the location of waiting."],
  ["talk", "Mark the place where you spoke with your friend.", "|友達と話しました。", "|ともだちとはなしました。", "で", e => `I spoke with my friend at the ${e}.`, "で marks where the conversation took place."],
  ["see-yesterday", "Mark the place where you saw your teacher yesterday.", "|昨日先生を見かけました。", "|きのうせんせいをみかけました。", "で", e => `I saw my teacher at the ${e} yesterday.`, "で marks where the sighting happened."],
  ["phone", "Mark the place where you called your friend.", "|友達に電話しました。", "|ともだちにでんわしました。", "で", e => `I called my friend from the ${e}.`, "で marks the location of the call; に marks the person called."],
  ["ask", "Mark the place where you asked a question.", "|質問しました。", "|しつもんしました。", "で", e => `I asked a question at the ${e}.`, "で marks where the question was asked."]
);
frames[3].patterns.push(
  ["arrive", "Give the exact time you arrived.", "|着きました。", "|つきました。", "に", e => `I arrived at ${e} o'clock.`, "に marks the time of arrival."],
  ["call", "Give the exact time you will call your friend.", "|友達に電話します。", "|ともだちにでんわします。", "に", e => `I will call my friend at ${e} o'clock.`, "に marks the time; the later に marks the person called."],
  ["sleep", "Give the exact time you go to bed.", "|寝ます。", "|ねます。", "に", e => `I go to bed at ${e} o'clock.`, "に marks the time point."],
  ["train", "Give the exact departure time of the train.", "|電車が出ます。", "|でんしゃがでます。", "に", e => `The train leaves at ${e} o'clock.`, "に marks the departure time."],
  ["meeting", "Give the exact time the meeting starts.", "|会議が始まります。", "|かいぎがはじまります。", "に", e => `The meeting starts at ${e} o'clock.`, "に marks the time the meeting begins."],
  ["work-from", "Mark the time when you start working.", "|仕事をします。", "|しごとをします。", "から", e => `I work from ${e} o'clock.`, "から marks the beginning of the work period."],
  ["work-until", "Mark the time when you stop working.", "|仕事をします。", "|しごとをします。", "まで", e => `I work until ${e} o'clock.`, "まで marks the end of the work period."],
  ["read-from", "Mark the time when you start reading.", "|本を読みます。", "|ほんをよみます。", "から", e => `I read from ${e} o'clock.`, "から marks the beginning of the reading period."],
  ["read-until", "Mark the time when you stop reading.", "|本を読みます。", "|ほんをよみます。", "まで", e => `I read until ${e} o'clock.`, "まで marks the end of the reading period."],
  ["open-until", "Mark the time when the shop stops being open.", "|店が開いています。", "|みせがあいています。", "まで", e => `The shop is open until ${e} o'clock.`, "まで marks the end of the opening hours."]
);
frames[4].patterns.push(
  ["buy-tomorrow-too", "You will buy milk tomorrow. Add that you will buy this item too.", "|明日買います。", "|あしたかいます。", "も", e => `I will buy ${e} tomorrow too.`, "も adds this item to the planned purchase."],
  ["buy-yesterday-too", "You bought milk yesterday. Add that you bought this item too.", "|昨日買いました。", "|きのうかいました。", "も", e => `I bought ${e} yesterday too.`, "も adds this item to the earlier purchase."],
  ["bring-tomorrow-too", "You will bring milk tomorrow. Add that you will bring this item too.", "|明日持ってきます。", "|あしたもってきます。", "も", e => `I will bring ${e} tomorrow too.`, "も adds this item to what you will bring."],
  ["prepare-tomorrow-too", "You will prepare milk tomorrow. Add that you will prepare this item too.", "|明日用意します。", "|あしたよういします。", "も", e => `I will prepare ${e} tomorrow too.`, "も adds this item to what you will prepare."],
  ["choose-yesterday-too", "You chose milk yesterday. Add that you chose this item too.", "|昨日選びました。", "|きのうえらびました。", "も", e => `I chose ${e} yesterday too.`, "も adds this item to the earlier choice."],
  ["bring-examples", "Give this item and milk as examples of things you brought.", "|牛乳などを持ってきました。", "|ぎゅうにゅうなどをもってきました。", "や", e => `I brought things such as ${e} and milk.`, "や introduces examples, reinforced by など."],
  ["choose-examples", "Give this item and milk as examples of things you chose.", "|牛乳などを選びました。", "|ぎゅうにゅうなどをえらびました。", "や", e => `I chose things such as ${e} and milk.`, "や introduces examples rather than a complete list."],
  ["prepare-both", "Name exactly this item and milk as the two things you prepared.", "|牛乳を用意しました。", "|ぎゅうにゅうをよういしました。", "と", e => `I prepared ${e} and milk.`, "と joins the two items in the stated list."],
  ["bring-both", "Name exactly this item and milk as the two things you brought.", "|牛乳を持ってきました。", "|ぎゅうにゅうをもってきました。", "と", e => `I brought ${e} and milk.`, "と joins the two items in the stated list."],
  ["choose-both", "Name exactly this item and milk as the two things you chose.", "|牛乳を選びました。", "|ぎゅうにゅうをえらびました。", "と", e => `I chose ${e} and milk.`, "と joins the two items in the stated list."]
);

export const expandedContexts = frames.flatMap(({ role, words, patterns }) =>
  patterns.flatMap(([id, context, sentence, pronunciation, accepted, translation, explanation]) =>
    words.map(([word, reading, english], index) => [
      `expanded-${role}-${id}-${index + 1}`, role, null, context,
      word + sentence, reading + pronunciation, accepted,
      role === "time" && english.includes(":") ? translation(english).replace(" o'clock", "") : translation(english), explanation
    ])
  )
);
