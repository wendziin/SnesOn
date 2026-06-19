#!/bin/bash
# Script para iniciar AMBOS os servidores:
# 1. Servidor de ROMs (Node.js) na porta 8084
# 2. Servidor do Web App na porta 8080

PORT_APP=8080
PORT_ROMS=8084
CDIR="$(dirname "$(readlink -f "$0")")"
cd "$CDIR"

# 1. Iniciar o servidor de ROMs Node.js em segundo plano
if command -v node &>/dev/null; then
    node server.js &
    NODE_PID=$!
    # Registrar trap para matar o processo do Node.js ao encerrar o script
    trap "kill $NODE_PID; echo -e '\nServidor de ROMs encerrado.'; exit" INT TERM
else
    echo "ERRO: Node.js não está instalado no Termux. Instale executando: pkg install nodejs"
    exit 1
fi

sleep 1 # Aguardar o Node.js inicializar

# 2. Tentar encontrar o IP local (WLAN)
IP_WLAN=$(ifconfig wlan0 2>/dev/null | grep -oE 'inet [0-9.]+' | cut -d' ' -f2)
if [ -z "$IP_WLAN" ]; then
    IP_WLAN=$(ip route get 1.1.1.1 2>/dev/null | grep -oE 'src [0-9.]+' | cut -d' ' -f2)
fi
if [ -z "$IP_WLAN" ]; then
    IP_WLAN="[IP_DO_SEU_CELULAR]"
fi

echo ""
echo "=========================================================="
echo "    RETROSTREAM SNES - AMBOS OS SERVIDORES INICIADOS"
echo "=========================================================="
echo " -> Servidor de ROMs rodando em: http://$IP_WLAN:$PORT_ROMS"
echo " -> Web App rodando em:          http://$IP_WLAN:$PORT_APP"
echo "=========================================================="
echo "    Pressione CTRL+C no Termux para encerrar ambos."
echo "=========================================================="
echo ""

# 3. Iniciar o servidor estático do Web App em primeiro plano
if command -v python3 &>/dev/null; then
    python3 -m http.server $PORT_APP
elif command -v python &>/dev/null; then
    python -m http.server $PORT_APP
elif command -v php &>/dev/null; then
    php -S 0.0.0.0:$PORT_APP
elif command -v busybox &>/dev/null && busybox --list | grep -q "^httpd$"; then
    busybox httpd -f -p $PORT_APP
else
    echo "ERRO: Nenhum servidor estático (Python, PHP, BusyBox) encontrado para o Web App."
    echo "Por favor, instale o python para rodar o app: pkg install python"
    kill $NODE_PID
fi
