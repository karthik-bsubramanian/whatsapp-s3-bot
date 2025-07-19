###### What we're going to do,

![Flow Diagram](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/97bn2fl11691gvi66yf1.png)

Managing and keeping track of receipts is always tedious and sometimes we tend to miss noting down the expenses what if we automate that process,

that is what this project aims to do,

you upload the receipt in you WhatsApp and let it take care of the rest and send you an E-mail

**1️⃣Create a twilio WhatsApp sandbox API,**

![twilio whatsapp sandbox](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/qzfh9w6jcltbmkrhux0z.png)

**2️⃣Create a s3 bucket,**

![AWS s3](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/5dyc7ddp3osnizkhori8.png)

**3️⃣Create a webhook,**

```
import express from 'express';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import fetch from 'node-fetch'; 

dotenv.config();

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

app.post('/whatsapp-webhook', async (req, res) => {
  const { Body, From, NumMedia, MediaUrl0, MediaContentType0 } = req.body;
  const sender = From.replace('whatsapp:', '');
  const timestamp = Date.now();

  try {
    if (parseInt(NumMedia) > 0) {
      const response = await fetch(MediaUrl0); // Twilio sends signed URL
      const buffer = await response.buffer();

      const extension = MediaContentType0.split('/')[1]; // e.g., image/jpeg → jpeg
      const Key = `whatsapp-media/${timestamp}-${sender}.${extension}`;

      await s3.send(new PutObjectCommand({
        Bucket: process.env.S3_BUCKET_NAME,
        Key,
        Body: buffer,
        ContentType: MediaContentType0,
      }));

      console.log(`Media uploaded: ${Key}`);

      // Send reply back to user
      return res.send(`
        <Response>
          <Message>Got your file! Uploaded as ${Key}</Message>
        </Response>
      `);
    } else {
      // Handle text messages
      const Key = `whatsapp-text/${timestamp}-${sender}.txt`;

      await s3.send(new PutObjectCommand({
        Bucket: process.env.S3_BUCKET_NAME,
        Key,
        Body,
        ContentType: 'text/plain',
      }));

      console.log(`Text uploaded: ${Key}`);

      return res.send(`
        <Response>
          <Message>Got your text and saved it!</Message>
        </Response>
      `);
    }
  } catch (err) {
    console.error('Error:', err);
    res.status(500).send('<Response><Message>Something went wrong</Message></Response>');
  }
});

app.listen(process.env.PORT, () => {
  console.log(`Webhook ready at http://localhost:${process.env.PORT}`);
});

```

**4️⃣Expose it using ngrok,**
```
node index.js
npm i -g ngrok
ngrok http 3000
```
**5️⃣Paste the ngrok url in twilio console,**

![twilio whatsapp](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/lf0j0273izo5dqyutfjd.png)


**6️⃣Create a DynamoDB table to store Data,**

![DynamoDB table](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/3p8y1ynvr0q1bjr4fttg.png)

**7️⃣Set Up Amazon SES (to send emails)**

Create a Identity in SES to send E-mails

Assuming you're in a sandbox account add & verify the recipient E-mail as well for non-sandbox accounts this step is not needed.

![SES create Identity](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/lhhp1uhc5rbku0ojpzxe.png)

After verifying your sender E-mail you must see something like this,

![SES sender verification](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/ptczkpai90vr4fs5ivko.png)

**8️⃣Create IAM Role for Lambda Execution**

Create a new Role choose Lambda as the use case,

![Lambda Role](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/wmsqmgm8xnww5lpkxj0c.png)

Attach the following policies,
```
   - `AmazonS3ReadOnlyAccess`
   - `AmazonTextractFullAccess`
   - `AmazonDynamoDBFullAccess`
   - `AmazonSESFullAccess`
   - `AWSLambdaBasicExecutionRole`
```
Name the role `LambdaReceiptProcessingRole`

![IAM Role](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/ktry8ymmghepdmrvtlkp.png)

**9️⃣Create Lambda Function (processing engine)**

Name the function `ProcessReceiptFunction`
Choose the existing role we just created,
Runtime Choose `Python 3.9`

![Lambda function Creation](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/yaxsg8k6gsiaagckmxtd.png)

Go to Configuration> Environment Variables and add these variables,

![Env Variables](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/nuquisaaci36wghn99dy.png)


Go to the Code tab and paste the code present in the helpers folder,

Go to configuration tab > General configuration > edit
Increase the timeout from 0.3 sec to 2 min for complex file.

![Edit settings](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/eupvexuf7xr2kdpobrmc.png)

Hit save


**1️⃣0️⃣Again go to the s3**
In the Properties Tab
Add the Event Notification
Prefix : whatsapp-media/
Object creation : Select All object create events

![Event trigger creation](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/1dhubrwdacvk6h9ffbeo.png)


**1️⃣1️⃣Finally choose the Destination**

![Destination](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/yzf0p6scf2l37r7hlobo.png)

>Wait for 30 sec and also check in spam folder for the mail....if you do not receive mail after 2 min go to the monitor tab in Lambda Function and check the log groups in cloudwatch


![Cloudwatch logs](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/agjlw0q8kd4etxnah2kh.png)



 

