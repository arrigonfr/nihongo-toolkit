import { practiceCredits as draft } from "./credits.js";
import { moreContexts } from "./particle-contexts.js";

const groups = { topic: "Topic or subject", object: "Object", place: "Destination or location", time: "Time or range", list: "Company, listing or addition" };
const data = [
  // Pair IDs connect different communicative tasks, not merely the same particle.
  ["cat-topic","topic","cat-subject","The cat is already your topic. Tell someone what it does every morning.","猫|毎朝ここに来ます。","ねこ|まいあさここにきます。","は","The cat comes here every morning.","は keeps the cat as the topic. が would single out the cat as the one that comes."],
  ["cat-subject","topic","cat-topic","Someone asks what comes here every morning. Identify the animal.","猫|毎朝ここに来ます。","ねこ|まいあさここにきます。","が","It’s the cat that comes here every morning.","が identifies the subject that answers ‘what?’ は takes the cat as an established topic instead."],
  ["rain","topic",null,"You notice rain beginning. Report the new event, without contrasting it with anything.","雨|降ってきました。","あめ|ふってきました。","が","It has started raining.","が introduces what you just noticed. は would make rain a topic or a contrast."],
  ["coffee-object","object","coffee-add","Name the thing you drink. Use the ordinary direct-object marker, not an additive or topic marker.","コーヒー|飲みます。","こーひー|のみます。","を","I drink coffee.","を marks what is drunk. も would mean you drink coffee as well."],
  ["door-object","object",null,"You open the door for a visitor. Mark the object of your action.","ドア|開けます。","どあ|あけます。","を","I open the door.","開ける acts on the door; を marks it. ドアが開きます would describe the door opening."],
  ["letter","object",null,"Say what you wrote, without singling it out as a topic.","手紙|書きました。","てがみ|かきました。","を","I wrote a letter.","を marks the thing written. に would instead mark a destination or a surface."],
  ["school-go","place","school-study","Say where you go. Either an endpoint or a direction fits.","学校|行く。","がっこう|いく。","にへ","I go to school.","で marks where an action takes place, not the destination of 行く."],
  ["school-study","place","school-go","You study on the school premises. Mark where the activity happens.","学校|勉強する。","がっこう|べんきょうする。","で","I study at school.","で marks the site of studying. に or へ would fit a verb of movement to school."],
  ["key-location","place",null,"A key is lying on the desk. Say where it is.","机の上|鍵があります。","つくえのうえ|かぎがあります。","に","There is a key on the desk.","に locates an existing thing with ある. で would locate an activity."],
  ["hours-from","time","hours-until","Six o’clock is when practice starts. Mark the beginning of the time span.","六時|練習します。","ろくじ|れんしゅうします。","から","I practice from six.","から gives the starting boundary; まで would make six the end."],
  ["hours-until","time","hours-from","You stop practicing at six. Mark the end of the time span.","六時|練習します。","ろくじ|れんしゅうします。","まで","I practice until six.","まで gives the ending boundary; から would make six the start."],
  ["train-time","time",null,"Pin the departure to exactly seven o’clock. Use a particle marking that point in time.","七時|電車が出ます。","しちじ|でんしゃがでます。","に","The train leaves at seven.","に marks a point in time. までに would mean ‘by’ seven, a deadline rather than the departure time."],
  ["coffee-add","list","coffee-object","You drink tea. Say you drink coffee too.","コーヒー|飲みます。","こーひー|のみます。","も","I drink coffee too.","も adds coffee to the set. を would simply mark the drink without saying ‘too’."],
  ["shopping-some","list","shopping-all","Give bread and milk as examples, not a complete shopping list.","パン|牛乳などを買います。","ぱん|ぎゅうにゅうなどをかいます。","や","I buy things like bread and milk.","や makes an open list, reinforced by など. と normally joins the items as a definite list."],
  ["shopping-all","list","shopping-some","List exactly the two items you are buying: bread and milk.","パン|牛乳を買います。","ぱん|ぎゅうにゅうをかいます。","と","I buy bread and milk.","と joins the two named items. や would present them as examples instead."],
  ["companion","list",null,"You and a friend travel together. Mark your companion.","友達|旅行します。","ともだち|りょこうします。","と","I travel with a friend.","と marks a companion. も would instead add the friend as another traveler."]
];
const choices = {topic:"はがも", object:"をにがも", place:"にへでを", time:"に から まで で", list:"とやもを"};
export const items = [...data,...moreContexts].map(([id, role, partner, context, sentence, pronunciation, accepted, translation, explanation]) => ({
  ...draft, id, role, partner, context, sentence, pronunciation, accepted: accepted === "から" || accepted === "まで" ? [accepted] : [...accepted],
  roleLabel: groups[role], choices: role === "time" ? choices.time.split(" ") : [...choices[role]],
  nuances: id === "school-go" ? {"へ":"へ points toward the destination. ","に":"に marks the destination as an endpoint. "} : {},
  translation, explanation, taskType: partner ? "contrast" : "blank"
}));
