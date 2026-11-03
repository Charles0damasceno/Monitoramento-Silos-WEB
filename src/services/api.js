import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 5000,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Interceptor para requisições
api.interceptors.request.use(
  config => {
    console.log(`Fazendo requisição para: ${config.url}`);
    return config;
  },
  error => {
    console.error('Erro na requisição:', error);
    return Promise.reject(error);
  }
);

// Interceptor para respostas
api.interceptors.response.use(
  response => {
    console.log(`Resposta recebida de: ${response.config.url}`);
    return response;
  },
  error => {
    if (error.response) {
      // O servidor respondeu com um status de erro
      console.error('Erro na resposta:', error.response.status, error.response.data);
    } else if (error.request) {
      // A requisição foi feita mas não houve resposta
      console.error('Sem resposta do servidor');
    } else {
      // Erro na configuração da requisição
      console.error('Erro ao configurar requisição:', error.message);
    }
    return Promise.reject(error);
  }
);

export default api; 