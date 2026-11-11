<?php
declare(strict_types=1);
namespace humhub\modules\matcherIdeas\application;
use humhub\modules\matcherIdeas\domain\{IdeaContent, IdeaException};
use humhub\modules\matcherIdeas\domain\ports\{IdeaRepository, NativeRelations};

/** Manual private drafts, followed by an explicit atomic confirmation. No model dependency. */
final class IdeaDraftService
{
    public function __construct(private IdeaRepository $repository, private NativeRelations $native) {}
    public function listOwned(int $actorId): array
    {
        $this->active($actorId);
        $items = $this->repository->ownedIdeas($actorId, 201);
        if (count($items) > 200) { throw new IdeaException('IDEA_LIST_LIMIT_EXCEEDED', 'The owned idea set exceeds the supported bound.', 503); }
        return ['items' => $items, 'next_cursor' => null];
    }
    public function start(int $actorId, ?int $ideaId = null, array $fields = [], string $rawText = ''): array
    {
        $this->fields($fields); $this->raw($rawText);
        return $this->repository->transaction(function () use ($actorId, $ideaId, $fields, $rawText): array {
            $this->active($actorId); $base = null;
            if ($ideaId !== null) {
                $base = $this->repository->idea($ideaId, true);
                if ($base === null || $base['creator_id'] !== $actorId || $base['status'] !== 'active') { throw new IdeaException('IDEA_NOT_FOUND', 'The idea is unavailable.', 404); }
                $fields = array_replace(['title' => $base['title'], 'summary' => $base['summary']], $fields);
            }
            return $this->repository->createDraft($actorId, $ideaId, $base['version'] ?? null, $fields, $rawText);
        });
    }
    public function read(int $actorId, int $draftId): array { return $this->owned($actorId, $draftId); }
    public function update(int $actorId, int $draftId, int $expectedVersion, array $fields, ?string $rawText = null): array
    {
        $this->fields($fields); if ($rawText !== null) { $this->raw($rawText); }
        return $this->repository->transaction(function () use ($actorId, $draftId, $expectedVersion, $fields, $rawText): array {
            $draft = $this->editable($actorId, $draftId, $expectedVersion);
            $changes = ['fields' => array_replace($draft['fields'], $fields)];
            if ($rawText !== null) { $changes['raw_text'] = $rawText; }
            return $this->repository->updateDraft($draftId, $expectedVersion, $changes);
        });
    }
    public function confirm(int $actorId, int $draftId, int $expectedVersion, array $fields = []): array
    {
        $this->fields($fields);
        return $this->repository->transaction(function () use ($actorId, $draftId, $expectedVersion, $fields): array {
            $draft = $this->editable($actorId, $draftId, $expectedVersion);
            $fields = array_replace($draft['fields'], $fields);
            $content = new IdeaContent($fields['title'] ?? '', $fields['summary'] ?? '');
            if ($draft['idea_id'] === null) { $idea = $this->repository->createIdea($actorId, $content->title, $content->summary); }
            else {
                $idea = $this->repository->idea($draft['idea_id'], true);
                if ($idea === null || $idea['creator_id'] !== $actorId || $idea['status'] !== 'active') { throw new IdeaException('IDEA_NOT_FOUND', 'The idea is unavailable.', 404); }
                $idea = $this->repository->updateIdea($idea['id'], $draft['base_version'], ['title' => $content->title, 'summary' => $content->summary]);
            }
            $confirmed = $this->repository->updateDraft($draftId, $expectedVersion, ['fields' => $fields, 'status' => 'confirmed', 'confirmed_idea_id' => $idea['id']]);
            return ['idea_id' => $idea['id'], 'version' => $idea['version'], 'draft_id' => $draftId, 'draft_version' => $confirmed['version']];
        });
    }
    private function owned(int $actorId, int $draftId): array
    {
        $this->active($actorId); $draft = $this->repository->draft($draftId, true);
        if ($draft === null || $draft['owner_id'] !== $actorId) { throw new IdeaException('IDEA_DRAFT_NOT_FOUND', 'The private draft is unavailable.', 404); }
        return $draft;
    }
    private function editable(int $actorId, int $draftId, int $expectedVersion): array
    {
        $draft = $this->owned($actorId, $draftId);
        if ($draft['status'] !== 'editing' || $expectedVersion < 1 || $draft['version'] !== $expectedVersion) { throw new IdeaException('IDEA_VERSION_CONFLICT', 'The draft has changed or has already been confirmed.', 409); }
        return $draft;
    }
    private function active(int $actorId): void
    { if (!$this->native->isActive($actorId)) { throw new IdeaException('IDEA_ACCESS_DENIED', 'An active authenticated account is required.', $actorId < 1 ? 401 : 403); } }
    private function fields(array $fields): void
    {
        if (array_diff(array_keys($fields), ['title', 'summary']) !== []) { throw new IdeaException('IDEA_VALIDATION_FAILED', 'Only formal title and summary are supported.'); }
        foreach ($fields as $key => $value) {
            if (!is_string($value) || !preg_match('//u', $value) || preg_match_all('/./us', $value) > ($key === 'title' ? 160 : 2000)) { throw new IdeaException('IDEA_VALIDATION_FAILED', 'Draft fields must be bounded text.'); }
        }
    }
    private function raw(string $rawText): void
    { if (!preg_match('//u', $rawText) || strlen($rawText) > 20000) { throw new IdeaException('IDEA_VALIDATION_FAILED', 'Draft source text must be valid UTF-8 of at most 20 KiB.'); } }
}
