const conf = require('./config') //
const MD5 = require("md5")

const {Telegraf, Markup} = require('telegraf')
const bot = new Telegraf(conf.authToken)
const knex = require('knex')(conf.MySQL);
knex.debug(true);
const Axios = require('axios')
const bjs = require('bitcoinjs-lib');
const XPubGenerator = require('xpub-generator').XPubGenerator;


const TenMinutes = 10 * 60 * 1000 //Інтервал перевірки оплати
var Status = 'Sleep' //Актуальна дія в адмінці
var checkorder = [] //Масив id чатів для перевірки ордерів
var Product = {
    Name: '',
    Description: '',
    Price: 0
}


bot.start(ctx => { //Початкова сторінка
    const { id, username, first_name, last_name } = ctx.from;
   
return ctx.replyWithHTML(`Привіт, ${first_name}! 
   Я Бот автопродаж.
   https://github.com/olksndrshpn/telegram-bot-autoshop-template


`, Markup.keyboard([
  ['Усі товари'],['Кнопка2'],
  ['Кнопка3']

]))


})
bot.help( ctx => ctx.replyWithHTML('/showproducs - Усі товари '))

 /* Команди для покупців*/

async function calcPrice(price){ //Долар в Біткоїн(перерахунок)
    try{
        let response = await Axios.get(`https://web-api.coinmarketcap.com/v1/tools/price-conversion?amount=${price}&convert_id=1&id=2781`)
        return Number(response.data.data.quote['1'].price.toFixed(8))  
    } catch(err){
        return 'Error'
    }     
}

async function getBalance(address){ //Перевірка балансу BTC адреси
    try{
        let response = await Axios.get(`https://chain.api.btc.com/v3/address/${address}`)        
        return {received: Number((response.data.data.received * 0.00000001).toFixed(8)), unconfirmed: Number((response.data.data.unconfirmed_received * 0.00000001).toFixed(8))}
 
    } catch(err){
        console.log(err)
        return {received: 'Error', unconfirmed: 'Error'}
    }
}

bot.on('callback_query', async ctx =>{//Подія після нажаття кнопки купити
    try{
        let t = ctx.update.callback_query.data.split('$') //слітємо дату яка вложена в кнопку купити
        let summa = await calcPrice(t[1]) //рахуємо ціну
        if (summa === 'Error') throw new Error('Не можу порахувати ціну')         
        let didi = -1
        let addresses = []
        for (let addr of await knex('my_orders').select('address')) addresses.push(addr.address) //витягуємо з БД біткоїн адреси      
        
        do {
            didi++
            t_address = new XPubGenerator(conf.xPub, bjs.networks.bitcoin).nthReceiving(didi)    
        } while (addresses.includes(t_address)) //генеруємо xpub адреси поки не буде того адресу який э в БД
        
        let Arra = {
            order_id: MD5(Date.now().toString+ctx.update.callback_query.id), //Унікальний ID замовлення
            address: t_address,
            status: 'Чекаю оплату',            
            price: summa,                    
            product_id: t[0],
            product_data: 'Буде доступно після оплати'        
        } 
        await knex('my_orders').insert(Arra) //Створюємо ордер
        ctx.reply(`Ваше замовлення очікує оплату, у разі несплати протягом 90хв замовлення буде анульовано. \nID замовлення: ${Arra.order_id}\nРеквизиты для оплаты: ${Arra.address}\nСумма к оплате: ${Arra.price}\nВы можете проверить статус вашего заказа отправив отправив команду /checkorder`)
    } catch(err){
        console.log(err)
        ctx.reply('Помилка')
    }
})

bot.hears('Усі товари', ctx =>{ //відповідь Кнопка1.
    knex.select().from('my_productsinfo')
    .then( resp =>{
        for (let product of resp){
            knex('my_products').where({product_id: product.product_id}).count({count: '*'})
            .then( resp => ctx.reply(`ID: ${product.product_id}\nНазва: ${product.name}\nОпис: ${product.description}\nЦіна: ${product.price}$\nCount: ${resp[0].count}`,
                Markup.inlineKeyboard([Markup.button.callback('Купити', `${product.product_id}$${product.price}`)]) )) //Дата в кнопке это ID$Price продукта
            .catch( err => ctx.reply('Не можу отримати список товарів'))            
        }
    })
    .catch(err => ctx.reply('Помилка'))
})
bot.hears('Кнопка2', ctx =>{ ctx.replyWithHTML ('Відовідь на Кнопка2')
})
bot.hears('Cтатус замовлення', ctx =>{ //режим перевірки ордера
    checkorder.push(ctx.message.chat.id)
    ctx.reply('Введите ID заказа')
}) 

bot.on('text', async (ctx, next) =>{ //Реакція на будь який текст
    if (checkorder.includes(ctx.message.chat.id)){ //Собственно если чат в режиме проверки заказа выполняется следующий код       
        const STF = await knex('my_orders').where({order_id: ctx.message.text})
        if (STF[0] == undefined){            
            ctx.reply('Ордер не знайдено')
        } else {                             
            ctx.reply(`ID замовлення: ${STF[0].order_id}\nID продукта: ${STF[0].product_id}\Реквізити: ${STF[0].address}\nСума до оплати: ${STF[0].price}\nСтатус: ${STF[0].status}\nТовар: ${STF[0].product_data}`)
        }                    
    checkorder.splice(checkorder.indexOf(ctx.message.chat.id), 1) //Видаляємо з масиву, відповідно статус перевірки замовлення видаляється                           
    }
    next()
})

bot.command('/echo', ctx =>{ //Команда щоб взнати свій чат ІД і стати адміном
  ctx.reply(ctx.message.chat.id)  
})

/* Адмінка*/

bot.use((ctx, next) =>{ //Прикольна фішка, типу внутрішній запит 
    if (ctx.message.chat.id === conf.adminChatId) next() // Якщо твоє ІД співпадає з ІД в настрояках - ти адмін
})

bot.command('/cancel', ctx =>{ 
    Status = 'Sleep' //Відміна всіх операцій
    ctx.reply('Усі операції скасовано')
})

bot.command('/addproduct', ctx =>{
    Status = 'AddProduct_N' //Режим додавання продукта
    ctx.reply('Вкажіть назву товару')     
})

bot.command('/addproductdata', ctx =>{
    Status = 'AddProductData' //Добавляємо сам продукт. Типу одиницю унікальну. В нашому випадку це інфа де 'клад'
    ctx.reply('Відправ дані в форматі ID$ProductData')     
})

bot.command('/showproductdata', ctx =>{
    knex('my_products').select() // Показує всі доступні продукти
    .then( resp => ctx.reply(resp))
    .catch( err => ctx.reply('Помилка')) 
})

bot.command('/delproductdata', ctx =>{
    Status = 'DelProductData' //Видаляє певний продукт з my_products
    ctx.reply('Відправ дані в форматі ID$ProductData')         
})

bot.command('/delproduct', ctx =>{
    Status = 'DelProduct' //Видаляємо продукти які бачить клієнт
    ctx.reply('відправ ID продукта який хочеш видалити')  
})

bot.on('text', ctx =>{ //опрацьовує те що ми вводимо і вибирає функцію.
    switch(Status){ 
        case 'DelProduct':
            Status = 'Sleep'
            knex('my_productsinfo').where({product_id: ctx.message.text}).del()
            .then( resp => ctx.reply('Видалено'))
            .catch( _err => ctx.reply('Помилка'))
            break
        case 'AddProduct_N':
            Status = 'AddProduct_D'
            Product.Name = ctx.message.text
            ctx.reply('Вкажи опис') 
            break    
        case 'AddProduct_D':
            Status = 'AddProduct_P'
            Product.Description = ctx.message.text
            ctx.reply('Вкажи ціну товару')
            break
        case 'AddProduct_P':
            Status = 'Sleep'
            Product.Price = parseInt(ctx.message.text)
            knex('my_productsinfo').insert({name: Product.Name, description: Product.Description, price: Product.Price})
            .then( resp =>ctx.reply('Товар успішно додано'))
            .catch( err => ctx.reply('Помилка')
            )
            console.log(err)
            break
        case 'AddProductData':
            Status = 'Sleep'
            t = ctx.message.text.split('$')
            knex('my_products').insert({product_id: t[0], product_data: t[1]})
            .then( resp => ctx.reply('Продукт додано в БД'))                
            .catch( err => ctx.reply('Помилка')) 
               
            break           

        case 'DelProductData':
            Status = 'Sleep'
            t = ctx.message.text.split('$')
            knex('my_products').where({product_id: t[0], product_data: t[1]}).del()
            .then( resp => ctx.reply('Видалено'))            
            .catch( err => ctx.reply('Помилка'))
            break
    }
})


bot.launch().then( () =>{ //Старт бота
    console.log('Bot Started!') 
    let timerId = setInterval( async () => { //таймер який спрацьовуй раз в 10хв для перевірки ордерів     
        my_orders = await knex('my_orders').whereNot({status: 'Виконано'}).select('address', 'status', 'price', 'product_id', 'order_data')
        for (let order of my_orders){ //Отримуємо ще не виконані ордери і переваіряємо їх
            let balance = await getBalance(order.address)
            if (balance.received >= order.price){ //Якщо на адресі сума яка вказана в ціні, або більше то закидуємо користувачу product_data
                let response = await knex('my_products').where({product_id: order.product_id})
                if (response != 0){
                    await knex('my_products').where({product_id: response[0].product_id, product_data: response[0].product_data}).del()
                    await knex('my_orders').where({address: order.address}).update({status: 'Виконано', product_data: response[0].product_data})
                }
            } else if (balance.unconfirmed  >= order.price){ //Перевіряємо чи є не підтверджені ордери
                await knex('my_orders').where({address: order.address}).update({status: 'В очікуванні підтвердження'})
            } else if (balance.received != 'Error'){ //Якщо пройшло 90 хв то видаляємо ордери які не оплатили
                if (order.order_data.setMinutes(order.order_data.getMinutes()+90) <= new Date ){
                    await knex('my_orders').where({address: order.address}).del()
                }
            }     
        }        
    }, TenMinutes) 
})

