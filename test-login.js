const fetch = require('node-fetch');

async function testLogin() {
  try {
    console.log('Testando login...');
    
    const response = await fetch('http://localhost:3000/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: 'admin@recorda.com',
        senha: 'password123'
      })
    });

    console.log('Status:', response.status);
    console.log('Headers:', Object.fromEntries(response.headers));
    
    const data = await response.json();
    console.log('Response:', JSON.stringify(data, null, 2));

    if (response.ok && data.accessToken) {
      console.log('\n✅ Login bem-sucedido!');
      console.log('Token:', data.accessToken.substring(0, 50) + '...');
      
      // Testar /auth/me
      console.log('\nTestando /auth/me...');
      const meResponse = await fetch('http://localhost:3000/auth/me', {
        headers: {
          'Authorization': `Bearer ${data.accessToken}`
        }
      });
      
      console.log('Status /auth/me:', meResponse.status);
      const meData = await meResponse.json();
      console.log('User data:', JSON.stringify(meData, null, 2));
    } else {
      console.log('\n❌ Login falhou!');
    }
  } catch (error) {
    console.error('Erro:', error);
  }
}

testLogin();
