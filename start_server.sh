#!/bin/bash
# Script para iniciar o servidor do emulador web no Termux

PORT=8080
CDIR="$(dirname "$(readlink -f "$0")")"
cd "$CDIR"

# Tentar encontrar o IP local (WLAN)
IP_WLAN=$(ifconfig wlan0 2>/dev/null | grep -oE 'inet [0-9.]+' | cut -d' ' -f2)
if [ -z "$IP_WLAN" ]; then
    # Tentar outro método genérico
    IP_WLAN=$(ip route get 1.1.1.1 2>/dev/null | grep -oE 'src [0-9.]+' | cut -d' ' -f2)
fi

if [ -z "$IP_WLAN" ]; then
    IP_WLAN="[IP_DO_SEU_CELULAR]"
fi

echo "=========================================================="
echo "    RETROSTREAM SNES WEB APP - INICIANDO SERVIDOR"
echo "=========================================================="
echo "Pasta do projeto: $CDIR"
echo ""

if command -v python3 &>/dev/null; then
    echo "-> Iniciando com Python 3 na porta $PORT..."
    echo "-> No celular, acesse: http://localhost:$PORT"
    echo "-> Na Smart TV, acesse: http://$IP_WLAN:$PORT"
    echo "=========================================================="
    python3 -m http.server $PORT
elif command -v python &>/dev/null; then
    echo "-> Iniciando com Python na porta $PORT..."
    echo "-> No celular, acesse: http://localhost:$PORT"
    echo "-> Na Smart TV, acesse: http://$IP_WLAN:$PORT"
    echo "=========================================================="
    python -m http.server $PORT
elif command -v php &>/dev/null; then
    echo "-> Iniciando com PHP na porta $PORT..."
    echo "-> No celular, acesse: http://localhost:$PORT"
    echo "-> Na Smart TV, acesse: http://$IP_WLAN:$PORT"
    echo "=========================================================="
    php -S 0.0.0.0:$PORT
elif command -v busybox &>/dev/null && busybox --list | grep -q "^httpd$"; then
    echo "-> Iniciando com BusyBox HTTPD na porta $PORT..."
    echo "-> No celular, acesse: http://localhost:$PORT"
    echo "-> Na Smart TV, acesse: http://$IP_WLAN:$PORT"
    echo "=========================================================="
    busybox httpd -f -p $PORT
else
    echo "ERRO: Nenhum servidor padrão (Python, PHP, BusyBox) encontrado no Termux."
    echo "Para rodar o app, instale o Python executando o seguinte comando no Termux:"
    echo "    pkg install python"
    echo "Depois, execute este script novamente."
fi
