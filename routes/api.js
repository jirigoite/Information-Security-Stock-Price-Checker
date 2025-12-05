'use strict';
const mongoose = require('mongoose');
const fetch = require('node-fetch'); 
const crypto = require('crypto');

// 1. Definir Schema y Modelo
const stockSchema = new mongoose.Schema({
  symbol: { type: String, required: true },
  likes: { type: [String], default: [] } // Array de IPs hasheadas
});
const Stock = mongoose.model('Stock', stockSchema);

module.exports = function (app) {

  // Función auxiliar para obtener precio de la API externa
  async function getStockPrice(stock) {
    const response = await fetch(`https://stock-price-checker-proxy.freecodecamp.rocks/v1/stock/${stock}/quote`);
    const data = await response.json();
    return data;
  }

  // Función auxiliar para manejar la DB y Likes
  async function saveStock(stockSymbol, like, ip) {
    const symbol = stockSymbol.toUpperCase();
    let stockDoc = await Stock.findOne({ symbol });
    
    if (!stockDoc) {
      stockDoc = new Stock({ symbol, likes: [] });
    }

    if (like && ip) {
      // Hashear IP para privacidad 
      const hashedIp = crypto.createHash('sha256').update(ip).digest('hex');
      // $addToSet evita duplicados automáticamente
      if (!stockDoc.likes.includes(hashedIp)) {
         stockDoc.likes.push(hashedIp);
      }
    }
    
    await stockDoc.save();
    return stockDoc;
  }

  app.route('/api/stock-prices')
    .get(async function (req, res) {
      const { stock, like } = req.query;
      // Obtener IP y anonimizarla
      const ip = req.ip || req.connection.remoteAddress;
      const shouldLike = like === 'true';

      // Lógica para 2 acciones (Array)
      if (Array.isArray(stock)) {
        const stock1Data = await getStockPrice(stock[0]);
        const stock2Data = await getStockPrice(stock[1]);

        const stock1Db = await saveStock(stock[0], shouldLike, ip);
        const stock2Db = await saveStock(stock[1], shouldLike, ip);

        let stockData = [
          {
            stock: stock1Data.symbol,
            price: stock1Data.latestPrice,
            rel_likes: stock1Db.likes.length - stock2Db.likes.length
          },
          {
            stock: stock2Data.symbol,
            price: stock2Data.latestPrice,
            rel_likes: stock2Db.likes.length - stock1Db.likes.length
          }
        ];

        return res.json({ stockData });

      } else {
        // Lógica para 1 sola acción
        const apiData = await getStockPrice(stock);
        // Si la API externa devuelve "Unknown symbol"
        if (!apiData.symbol) return res.json({ error: 'Stock not found' });

        const dbData = await saveStock(stock, shouldLike, ip);

        return res.json({
          stockData: {
            stock: apiData.symbol,
            price: apiData.latestPrice,
            likes: dbData.likes.length
          }
        });
      }
    });
};