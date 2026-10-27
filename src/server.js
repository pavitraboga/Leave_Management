const { createApp } = require('./app');
const { createMongoStore } = require('./stores/mongoStore');
const { seed } = require('./seed');

const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/leave_db';

async function start() {
  for (let attempt = 1; ; attempt++) {
    try {
      const store = await createMongoStore(MONGO_URI);
      await seed(store);
      createApp(store).listen(PORT, () => console.log(`Leave app listening on :${PORT}`));
      return;
    } catch (err) {
      if (attempt >= 10) throw err;
      console.log(`MongoDB not ready (attempt ${attempt}), retrying in 3s...`);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
