<?php
declare(strict_types=1);
namespace humhub\modules\matcherIdeas;
use humhub\modules\matcherIdeas\adapters\native\{NativeIdeaRelations, NativeCurrentSpaceAccess, NativeCurrentSpaceFactory};
use humhub\modules\matcherIdeas\adapters\persistence\SqlIdeaRepository;
use humhub\modules\matcherIdeas\application\{IdeaService, IdeaDraftService, IdeaRelationSource};
use humhub\modules\matcherIdeas\domain\IdeaException;
use humhub\modules\matcherRecommendation\contracts\ports\CurrentEventAccess;
use humhub\services\ModuleService;
use Yii;

final class Module extends \humhub\components\Module
{
    private ?SqlIdeaRepository $repository = null;
    private ?NativeIdeaRelations $native = null;
    private ?CurrentEventAccess $currentEvents = null;
    public function getRepository(): SqlIdeaRepository { return $this->repository ??= new SqlIdeaRepository(Yii::$app->db); }
    public function getNativeRelations(): NativeIdeaRelations { return $this->native ??= new NativeIdeaRelations(Yii::$app->db); }
    public function getCurrentEventAccess(): CurrentEventAccess
    {
        $module = Yii::$app->getModule('matcher-recommendation');
        if (!$module instanceof \humhub\modules\matcherRecommendation\Module || !$module->isEnabled) {
            throw new IdeaException('IDEA_CURRENT_EVENT_UNAVAILABLE', 'The current Space service is unavailable.', 503);
        }
        return $this->currentEvents ??= NativeCurrentSpaceFactory::create(Yii::$app->db,
            new \humhub\modules\matcherRecommendation\adapters\native\YiiActorSessionSource(Yii::$app->user, Yii::$app->session));
    }
    public function getIdeaService(): IdeaService
    { return new IdeaService($this->getRepository(), $this->getNativeRelations(), new NativeCurrentSpaceAccess($this->getCurrentEventAccess())); }
    public function getDraftService(): IdeaDraftService
    { return new IdeaDraftService($this->getRepository(), $this->getNativeRelations()); }
    public function getRelationSource(): IdeaRelationSource
    { return new IdeaRelationSource($this->getRepository(), $this->getNativeRelations(), new NativeCurrentSpaceAccess($this->getCurrentEventAccess())); }
    public function disable() { $this->getModuleService()->disable(); return true; }
    public function getModuleService(): ModuleService { return new IdeaModuleService($this); }
}
final class IdeaModuleService extends ModuleService
{
    public function canRemove(): bool { return false; }
    public function remove(bool $disableBeforeRemove = true): ?string
    { throw new \LogicException('Retained private drafts and permanent conversation bindings require a reviewed data handover.'); }
}
