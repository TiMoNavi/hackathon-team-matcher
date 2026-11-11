<?php
$root = dirname(__DIR__);
$app = require __DIR__ . '/app.php';
$c = json_decode(file_get_contents($root . '/.runtime/preview-credentials.json'), true, flags: JSON_THROW_ON_ERROR);
use humhub\modules\user\models\User;
use humhub\modules\user\models\Password;
use humhub\modules\space\models\Space;
use humhub\modules\content\models\Content;
use humhub\modules\post\models\Post;
function saveOrFail($model) {
    if (!$model->save()) { throw new RuntimeException(get_class($model) . ': ' . json_encode($model->getErrors())); }
}
$admin = User::findOne(['username' => $c['admin_username']]);
$admin->language = 'zh-CN'; saveOrFail($admin);
$app->settings->set('defaultLanguage', 'zh-CN');
$app->user->switchIdentity($admin);
$users = [];
foreach (['a','b'] as $suffix) {
    $user = User::findOne(['username' => 'preview_' . $suffix]);
    if (!$user) {
        $user = new User(['username' => 'preview_' . $suffix, 'email' => 'preview_' . $suffix . '@localhost.test', 'status' => User::STATUS_ENABLED, 'language' => 'zh-CN']);
        saveOrFail($user);
        $user->profile->firstname = '演示用户'; $user->profile->lastname = strtoupper($suffix); saveOrFail($user->profile);
        $password = new Password(['user_id' => $user->id]); $password->setPassword($c['demo_password']); saveOrFail($password);
    }
    $users[$suffix] = $user;
}
$spaces = [];
foreach (['a','b'] as $suffix) {
    $name = '模块预览活动 ' . strtoupper($suffix);
    $space = Space::findOne(['name' => $name]);
    if (!$space) {
        $space = new Space(['name' => $name, 'description' => '仅为本机原生能力演示，不含真实用户资料；项目邀请码和当前活动规则尚未实现。', 'visibility' => Space::VISIBILITY_NONE, 'join_policy' => Space::JOIN_POLICY_NONE]);
        saveOrFail($space);
    }
    $space->addMember($admin->id); $space->addMember($users[$suffix]->id);
    foreach (['calendar','questions','gallery','linklist'] as $module) {
        if (!$space->moduleManager->isEnabled($module)) { $space->moduleManager->enable($module); }
    }
    $spaces[$suffix] = $space;
}
$space = $spaces['a'];
$postText = "免费模块预览：这里用于体验帖子、评论、文件和 Clean Theme。\n这是演示数据，未实现项目推荐或 AI。";
$post = Post::findOne(['message' => $postText]);
if (!$post) { $post = new Post($space, Content::VISIBILITY_PRIVATE); $post->message = $postText; saveOrFail($post); }
$post->content->getStateService()->publish();
$commentText = '演示评论：可以从活动内容进入讨论；这不是多人即时聊天。';
if (!humhub\modules\comment\models\Comment::find()->where(['message' => $commentText, 'content_id' => $post->content->id])->exists()) {
    $app->user->switchIdentity($users['a']);
    $comment = new humhub\modules\comment\models\Comment(['message' => $commentText, 'content_id' => $post->content->id]); saveOrFail($comment);
    $app->user->switchIdentity($admin);
}
$qText = 'Q&A 预览：怎样开始寻找队友？';
$question = humhub\modules\questions\models\Question::findOne(['question' => $qText]);
if (!$question) { $question = new humhub\modules\questions\models\Question($space, Content::VISIBILITY_PRIVATE); $question->question = $qText; saveOrFail($question); }
$question->content->getStateService()->publish();
if (!humhub\modules\questions\models\QuestionAnswer::find()->where(['question_id' => $question->id])->exists()) {
    $answer = new humhub\modules\questions\models\QuestionAnswer(['question_id' => $question->id, 'answer' => '这是原生问答演示。活动内人物发现和 AI 推荐将由项目插件补齐。']); saveOrFail($answer);
}
$calendar = humhub\modules\calendar\models\CalendarEntry::findOne(['title' => '赛程预览：项目路演']);
if (!$calendar) {
    $calendar = new humhub\modules\calendar\models\CalendarEntry($space, Content::VISIBILITY_PRIVATE);
    $calendar->title = '赛程预览：项目路演'; $calendar->description = '演示赛程，不是真实活动通知。';
    $calendar->start_datetime = '2026-11-12 10:00:00'; $calendar->end_datetime = '2026-11-12 11:00:00';
    $calendar->time_zone = 'Asia/Shanghai'; saveOrFail($calendar);
}
$calendar->content->getStateService()->publish();
$calendar->all_day = 0;
$calendar->start_datetime = '2026-11-12 10:00:00';
$calendar->end_datetime = '2026-11-12 11:00:00';
saveOrFail($calendar);
$category = humhub\modules\linklist\models\Category::findOne(['title' => '演示资源']);
if (!$category) { $category = new humhub\modules\linklist\models\Category($space, Content::VISIBILITY_PRIVATE); $category->title = '演示资源'; saveOrFail($category); }
if (!humhub\modules\linklist\models\Link::find()->where(['category_id' => $category->id])->exists()) {
    $link = new humhub\modules\linklist\models\Link(['category_id' => $category->id, 'title' => 'HumHub 官方文档', 'href' => 'https://docs.humhub.org/']); saveOrFail($link);
}
$pdf = humhub\modules\file\models\File::findOne(['file_name' => 'humhub-preview.pdf']);
if (!$pdf) {
    $stream = "BT /F1 20 Tf 50 780 Td (HumHub Free Preview) Tj 0 -35 Td /F1 12 Tf (Demo file - no personal data) Tj ET";
    $objects = ['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>','<< /Length '.strlen($stream).' >>'."\nstream\n".$stream."\nendstream"];
    $data = "%PDF-1.4\n"; $offsets = [0];
    foreach ($objects as $i => $object) { $offsets[] = strlen($data); $data .= ($i+1)." 0 obj\n".$object."\nendobj\n"; }
    $xref = strlen($data); $data .= "xref\n0 6\n0000000000 65535 f \n";
    foreach (array_slice($offsets,1) as $offset) { $data .= sprintf("%010d 00000 n \n",$offset); }
    $data .= "trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n".$xref."\n%%EOF\n";
    $pdf = new humhub\modules\file\models\File(['file_name' => 'humhub-preview.pdf', 'mime_type' => 'application/pdf', 'size' => strlen($data)]);
    $pdf->setPolymorphicRelation($post); saveOrFail($pdf); $pdf->setStoredFileContent($data);
}
$rest = $app->getModule('rest')->settings;
$rest->set('enableBasicAuth', true); $rest->set('enableBearerAuth', false); $rest->set('enableQueryParamAuth', false); $rest->set('enabledForAllUsers', false);
$rest->setSerialized('enabledUsers', [$admin->guid, $users['a']->guid]);
$state = ['admin_id' => $admin->id, 'demo_a_id' => $users['a']->id, 'demo_b_id' => $users['b']->id, 'space_a_id' => $spaces['a']->id, 'space_a_guid' => $spaces['a']->guid, 'space_b_id' => $spaces['b']->id, 'space_b_guid' => $spaces['b']->guid, 'post_id' => $post->id, 'post_content_id' => $post->content->id, 'question_id' => $question->id, 'calendar_id' => $calendar->id, 'pdf_guid' => $pdf->guid, 'pdf_url' => $pdf->getUrl()];
$state['space_a_url'] = $spaces['a']->getUrl();
$state['space_b_url'] = $spaces['b']->getUrl();
$state['question_url'] = $question->getUrl();
file_put_contents($root.'/.runtime/preview-fixtures.json', json_encode($state,JSON_PRETTY_PRINT|JSON_UNESCAPED_UNICODE));
file_put_contents(__DIR__.'/profile-fields.json', json_encode(humhub\modules\user\models\ProfileField::find()->select(['internal_name','title','field_type_class','required','visible','editable'])->asArray()->all(),JSON_PRETTY_PRINT|JSON_UNESCAPED_UNICODE));
echo "Created two private demo Spaces, two demo users, a post/comment, Q&A, a calendar entry, a link and a private PDF.\n";
