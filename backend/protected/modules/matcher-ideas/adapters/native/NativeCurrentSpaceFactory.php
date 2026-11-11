<?php
declare(strict_types=1);
namespace humhub\modules\matcherIdeas\adapters\native;
use humhub\modules\matcherIdeas\domain\IdeaException;
use humhub\modules\matcherRecommendation\adapters\native\{NativeCurrentEventAccess, SqlCurrentEventSelectionStore, ServerActorSessionSource};
use humhub\modules\matcherRecommendation\contracts\ports\CurrentEventAccess;
use yii\db\Connection;

/** Explicit independent authorization connection: never reuse the mutation transaction snapshot. */
final class NativeCurrentSpaceFactory
{
    public static function create(Connection $writeConnection, ServerActorSessionSource $identity): CurrentEventAccess
    {
        // Yii intentionally retains the same PDO when cloning sqlite::memory:. Such a clone
        // would not be an independent authorization connection, so fail instead of pretending.
        if (str_starts_with($writeConnection->dsn, 'sqlite::memory:')) {
            throw new IdeaException('IDEA_AUTHORIZATION_UNAVAILABLE', 'Independent authorization requires a distinct database connection.', 503);
        }
        $reader = clone ($writeConnection->getMaster() ?? $writeConnection);
        $reader->tablePrefix = $writeConnection->tablePrefix;
        $reader->masters = []; $reader->slaves = [];
        $reader->attributes = array_replace($reader->attributes ?? [], [\PDO::ATTR_PERSISTENT => false]);
        $reader->enableSlaves = false;
        $reader->enableQueryCache = false;
        $reader->enableSchemaCache = false;
        $reader->enableLogging = false;
        $reader->enableProfiling = false;
        $policy = 'ordinary-activity-access-v1';
        $selection = new SqlCurrentEventSelectionStore($reader, $identity, $policy);
        return new NativeCurrentEventAccess($reader, $selection, $policy);
    }
}
