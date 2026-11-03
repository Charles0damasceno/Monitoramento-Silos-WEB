const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Configuração CORS com opções mais específicas
app.use(cors({
  origin: 'http://localhost:3000',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// Configuração MySQL que sabemos que funciona
const dbConfig = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: 3306,
  connectTimeout: 10000
};

// Criar pool de conexões
const pool = mysql.createPool({
  ...dbConfig,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Middleware para logging de requisições
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Função para testar conexão MySQL
const testDatabaseConnection = () => {
  return new Promise((resolve) => {
    pool.getConnection((err, connection) => {
      if (err) {
        console.error('Erro ao conectar ao MySQL:', err.message);
        resolve(false);
        return;
      }
      connection.release();
      resolve(true);
    });
  });
};

// Dados mockados para fallback
const mockSilos = [
  { id: 1, capacidade: 100000, quantidade: 75000 },
  { id: 2, capacidade: 100000, quantidade: 50000 },
  { id: 3, capacidade: 100000, quantidade: 25000 }
];

// Middleware de tratamento de erros
const errorHandler = (err, req, res, next) => {
  console.error('Erro na aplicação:', err);
  res.status(500).json({ 
    error: 'Erro interno do servidor',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
};

// Rota de teste
app.get('/api/test', (req, res) => {
  res.json({ 
    message: 'Servidor funcionando!',
    timestamp: new Date().toISOString()
  });
});

// Rota para buscar dados dos silos
app.get('/api/silos', async (req, res) => {
  try {
    const query = 'SELECT * FROM `silo` LIMIT 50';
    
    pool.query(query, (error, results) => {
      if (error) {
        console.error('Erro na consulta MySQL:', error.message);
        return res.json(mockSilos);
      }

      if (!results || results.length === 0) {
        console.log('Nenhum resultado encontrado, usando dados mockados');
        return res.json(mockSilos);
      }

      // Usando os dados do último registro encontrado
      const ultimoRegistro = results[results.length - 1];
      console.log('Último registro encontrado:', ultimoRegistro);
      
      const silos = [
        { id: 1, capacidade: 100000, quantidade: (ultimoRegistro.Silo1 || 0) },
        { id: 2, capacidade: 100000, quantidade: (ultimoRegistro.Silo2 || 0) },
        { id: 3, capacidade: 100000, quantidade: (ultimoRegistro.Silo3 || 0) }
      ];

      res.json(silos);
    });
  } catch (error) {
    console.error('Erro ao processar requisição:', error.message);
    res.json(mockSilos);
  }
});

// Status do servidor
app.get('/api/status', async (req, res) => {
  const mysqlConnected = await testDatabaseConnection();
  res.json({
    mode: process.env.NODE_ENV || 'development',
    mysqlConnected,
    serverTime: new Date().toISOString(),
    config: {
      host: dbConfig.host,
      database: dbConfig.database,
      port: dbConfig.port
    }
  });
});

// Registra o middleware de tratamento de erros
app.use(errorHandler);

// Função para iniciar o servidor
const startServer = (port) => {
  try {
    const numericPort = parseInt(port);
    if (isNaN(numericPort) || numericPort < 0 || numericPort >= 65536) {
      throw new Error('Porta inválida');
    }

    const server = app.listen(numericPort, '0.0.0.0', async () => {
      console.log(`Servidor rodando em http://0.0.0.0:${numericPort}`);
      const mysqlConnected = await testDatabaseConnection();
      console.log('Status MySQL:', mysqlConnected ? 'Conectado' : 'Desconectado');
      console.log('Ambiente:', process.env.NODE_ENV || 'development');
    });

    server.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        console.log(`Porta ${numericPort} em uso, tentando próxima porta...`);
        startServer(numericPort + 1);
      } else {
        console.error('Erro ao iniciar servidor:', error);
      }
    });
  } catch (error) {
    console.error('Erro ao iniciar servidor:', error);
  }
};

// Inicia o servidor
const PORT = process.env.PORT || 12322;
startServer(PORT); 