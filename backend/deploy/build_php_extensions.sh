#!/bin/sh
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
PREFIX="$ROOT/.runtime/php-mysql"
export PATH="$PREFIX/bin:$PATH"
export PKG_CONFIG_PATH="$PREFIX/lib/pkgconfig:$PREFIX/share/pkgconfig"
export CPPFLAGS="-I$PREFIX/include"
export LDFLAGS="-L$PREFIX/lib -Wl,-rpath,$PREFIX/lib"
SOURCE="$ROOT/.runtime/build/php-8.5.12"
for extension in mysqlnd pdo_mysql gd; do
  cd "$SOURCE/ext/$extension"
  if [ "$extension" = mysqlnd ]; then cp config9.m4 config.m4; fi
  "$PREFIX/bin/phpize" > "$ROOT/.runtime/logs/build-$extension.log" 2>&1
  case "$extension" in
    mysqlnd) set -- --enable-mysqlnd --with-mysqlnd-ssl ;;
    pdo_mysql) set -- --with-pdo-mysql=mysqlnd ;;
    gd) export GDLIB_CFLAGS="-I$PREFIX/include"; export GDLIB_LIBS="-L$PREFIX/lib -lgd"; set -- --enable-gd --with-external-gd ;;
  esac
  ./configure --with-php-config="$PREFIX/bin/php-config" "$@" >> "$ROOT/.runtime/logs/build-$extension.log" 2>&1
  # mysqlnd is normally built in PHP itself; its .c files rely on the core
  # configuration header. Force the extension configuration for a shared build.
  BUILD_CFLAGS="-g -O2"
  if [ "$extension" = mysqlnd ]; then BUILD_CFLAGS="$BUILD_CFLAGS -include $SOURCE/ext/mysqlnd/config.h"; fi
  make clean >> "$ROOT/.runtime/logs/build-$extension.log" 2>&1
  make -j4 CFLAGS="$BUILD_CFLAGS" RE2C="$PREFIX/bin/re2c" >> "$ROOT/.runtime/logs/build-$extension.log" 2>&1
  make install >> "$ROOT/.runtime/logs/build-$extension.log" 2>&1
  printf '%s\n' "Built PHP extension: $extension"
done
