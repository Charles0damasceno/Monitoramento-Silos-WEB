require('dotenv').config();
const mysql = require('mysql2');

const config = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: 3306
};

console.log('Tentando conectar ao MySQL com as seguintes configurações:');
console.log(JSON.stringify({ ...config, password: '***' }, null, 2));

const connection = mysql.createConnection(config);

connection.connect((err) => {
  if (err) {
    console.error('Erro ao conectar ao MySQL:');
    console.error('Código:', err.code);
    console.error('Número do erro:', err.errno);
    console.error('SQL State:', err.sqlState);
    console.error('Mensagem:', err.message);
    process.exit(1);
  }

  console.log('Conectado ao MySQL com sucesso!');
  
  // Testa a query
  connection.query('SELECT * FROM silo LIMIT 1', (err, results) => {
    if (err) {
      console.error('Erro ao executar query:');
      console.error(err);
    } else {
      console.log('Query executada com sucesso!');
      console.log('Resultados:', results);
    }
    
    connection.end(() => {
      console.log('Conexão fechada');
      process.exit(0);
    });
  });
}); 