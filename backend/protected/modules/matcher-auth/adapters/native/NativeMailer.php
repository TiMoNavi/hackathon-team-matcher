<?php
declare(strict_types=1);
namespace humhub\modules\matcherAuth\adapters\native;

use humhub\modules\matcherAuth\domain\ports\OtpMailer;
use Yii;

final class NativeMailer implements OtpMailer
{
    public function available(): bool { return Yii::$app->has('mailer') && Yii::$app->mailer->useFileTransport === false; }
    public function send(string $email, string $code, int $expiresIn): bool
    {
        if (!$this->available()) { return false; }
        return Yii::$app->mailer->compose()->setTo($email)->setSubject('活动应用登录验证码')
            ->setTextBody('你的验证码是 ' . $code . '，有效期 ' . (int)($expiresIn / 60) . ' 分钟。若非本人操作，请忽略此邮件。')->send();
    }
}
