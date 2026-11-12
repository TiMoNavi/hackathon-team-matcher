<?php
declare(strict_types=1);
namespace humhub\modules\matcherChat\adapters\native;

use humhub\modules\matcherChat\adapters\persistence\SqlState;
use humhub\modules\matcherChat\domain\{ChatException, SafeInteger};

/** Explicit reviewed admission, no HTTP action and no pair-uniqueness ownership. */
final class DirectAdmission
{
    public function __construct(private readonly SqlState $sql) {}

    public function acceptExistingDirect(int $messageId, array $exactPair, string $evidenceRef): array
    {
        SafeInteger::positive($messageId, 'conversation_id');
        $pair = NativeProjection::pair($exactPair);
        $evidenceRef = NativeProjection::reference($evidenceRef);
        return $this->sql->transaction(function () use ($messageId, $pair, $evidenceRef): array {
            $existing = $this->sql->state($messageId);
            if ($existing !== null) {
                if ($existing['status'] !== 'active' || [SafeInteger::native($existing['pair_low'], 'pair_low'), SafeInteger::native($existing['pair_high'], 'pair_high')] !== $pair || $existing['admission_ref'] !== $evidenceRef) {
                    throw new ChatException('ADMISSION_CONFLICT', 'The admission does not match the recorded decision.', 409);
                }
                return $this->result($this->sql->synchronize($messageId));
            }
            $message = $this->sql->nativeMessage($messageId);
            $members = $this->sql->nativeMembers($messageId);
            if ($message === null || !$this->sql->exactMembers($members, $pair) || !$this->sql->pairEnabled($pair) || $this->sql->hasFiles($messageId)) {
                throw new ChatException('DIRECT_ADMISSION_DENIED', 'The exact native members or attachment-free history are not admissible.', 409);
            }
            $this->sql->db->createCommand()->insert('{{%matcher_chat_conversation}}', [
                'message_id' => $messageId, 'type' => 'direct', 'status' => 'active', 'version' => 1, 'last_seq' => 0,
                'pair_low' => $pair[0], 'pair_high' => $pair[1], 'native_members_hash' => NativeProjection::membershipHash($members),
                'native_projection_hash' => str_repeat('0', 64), 'admission_ref' => $evidenceRef, 'admitted_at' => time(),
            ])->execute();
            foreach ($pair as $viewer) {
                $this->sql->db->createCommand()->insert('{{%matcher_chat_member}}', ['message_id' => $messageId, 'user_id' => $viewer, 'generation' => 1, 'join_seq' => 0, 'status' => 'active'])->execute();
            }
            return $this->result($this->sql->synchronize($messageId));
        });
    }

    public function revokeDirect(int $messageId, string $evidenceRef): array
    {
        SafeInteger::positive($messageId, 'conversation_id');
        $evidenceRef = NativeProjection::reference($evidenceRef);
        return $this->sql->transaction(function () use ($messageId, $evidenceRef): array {
            if ($this->sql->state($messageId) === null) { throw ChatException::unavailable(); }
            $this->sql->revoke($messageId, $evidenceRef);
            return $this->result($this->sql->state($messageId));
        });
    }

    private function result(array $state): array
    {
        return ['conversation_id' => SafeInteger::native($state['message_id'], 'conversation_id'), 'type' => 'direct', 'status' => $state['status'], 'version' => SafeInteger::native($state['version'], 'version'), 'last_seq' => SafeInteger::native($state['last_seq'], 'last_seq', true), 'member_ids' => [SafeInteger::native($state['pair_low'], 'pair_low'), SafeInteger::native($state['pair_high'], 'pair_high')]];
    }
}
