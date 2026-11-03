require('dotenv').config();
const mysql = require('mysql2');

const config = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: 3306
};

console.log('Tentando conectar com as seguintes configurações:');
console.log('Host:', config.host);
console.log('Usuário:', config.user);
console.log('Banco:', config.database);
console.log('Porta:', config.port);

const connection = mysql.createConnection(config);

connection.connect((err) => {
  if (err) {
    console.error('Erro ao conectar ao banco de dados:');
    console.error('Código do erro:', err.code);
    console.error('Número do erro:', err.errno);
    console.error('Mensagem:', err.message);
    console.error('SQL State:', err.sqlState);
    process.exit(1);
  }
  
  console.log('Conexão estabelecida com sucesso!');
  
  // Testa uma query simples
  connection.query('SELECT 1', (err, results) => {
    if (err) {
      console.error('Erro ao executar query de teste:', err);
    } else {
      console.log('Query de teste executada com sucesso!');
    }
    
    connection.end();
  });
}); 