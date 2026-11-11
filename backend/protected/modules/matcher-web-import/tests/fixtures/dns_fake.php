<?php
declare(strict_types=1);
echo ($argv[1] ?? '') === 'invalid.example.com' ? '{"unexpected":true}' : '["93.184.216.34","2606:4700::1111"]';
