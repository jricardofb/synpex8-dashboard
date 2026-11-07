#property strict

input string InpApiUrl = "https://your-host/api/v1/signals";
input string InpMasterId = "MASTER-1";
input string InpMasterSecret = "";
input string InpRobotId = "ROBOT-1-1";
input string InpStrategyId = "STRAT-1-1-1";
input string InpSymbol = "XAUUSD";
input bool InpBuy = true;
input double InpTestLot = 0.01;
input long InpMagicNumber = 1001;
input bool InpSendTestSignal = false;
input bool InpResetTestGuard = false;

const string TEST_GUARD_NAME = "SYNPEX8.Signal1Test.sent";

bool IsSafeIdentifier(const string value)
  {
   int length=StringLen(value);
   if(length<1 || length>128)
      return false;

   for(int i=0; i<length; i++)
     {
      ushort c=StringGetCharacter(value,i);
      if((c>='a' && c<='z') ||
         (c>='A' && c<='Z') ||
         (c>='0' && c<='9') ||
         c=='_' || c=='-' || c=='.')
         continue;
      return false;
     }
   return true;
  }

bool ToUtf8Bytes(const string value, uchar &bytes[])
  {
   int count=StringToCharArray(value,bytes,0,WHOLE_ARRAY,CP_UTF8);
   if(count<1)
      return false;
   ArrayResize(bytes,count-1);
   return true;
  }

string BytesToHex(const uchar &bytes[])
  {
   string hex="";
   for(int i=0; i<ArraySize(bytes); i++)
      hex+=StringFormat("%.2x",bytes[i]);
   return hex;
  }

bool HmacSha256(const string secret, const string message, string &signature)
  {
   uchar key[],messageBytes[],empty[],inner[],outer[],innerHash[],digest[];
   if(!ToUtf8Bytes(secret,key) || !ToUtf8Bytes(message,messageBytes))
      return false;

   if(ArraySize(key)>64)
     {
      uchar shortened[];
      if(CryptEncode(CRYPT_HASH_SHA256,key,empty,shortened)!=32)
         return false;
      ArrayCopy(key,shortened);
      ArrayResize(key,32);
     }

   int keyLength=ArraySize(key);
   if(ArrayResize(key,64)!=64)
      return false;

   ArrayResize(inner,64+ArraySize(messageBytes));
   ArrayResize(outer,96);
   for(int i=0; i<64; i++)
     {
      uchar keyByte=(i<keyLength ? key[i] : 0);
      inner[i]=(uchar)(keyByte ^ 0x36);
      outer[i]=(uchar)(keyByte ^ 0x5c);
     }
   for(int i=0; i<ArraySize(messageBytes); i++)
      inner[64+i]=messageBytes[i];

   if(CryptEncode(CRYPT_HASH_SHA256,inner,empty,innerHash)!=32)
      return false;
   for(int i=0; i<32; i++)
      outer[64+i]=innerHash[i];
   if(CryptEncode(CRYPT_HASH_SHA256,outer,empty,digest)!=32)
      return false;

   signature=BytesToHex(digest);
   return StringLen(signature)==64;
  }

int OnInit()
  {
   if(InpResetTestGuard)
     {
      if(GlobalVariableCheck(TEST_GUARD_NAME))
         GlobalVariableDel(TEST_GUARD_NAME);
      Print("Test guard reset only; no signal sent. Set InpResetTestGuard=false and reattach to send.");
      return INIT_SUCCEEDED;
     }

   if(GlobalVariableCheck(TEST_GUARD_NAME))
     {
      Print("Test signal already attempted in this MT5 terminal. Reset the test guard explicitly before another attempt.");
      return INIT_SUCCEEDED;
     }

   if(!InpSendTestSignal)
     {
      Print("Signal not sent. Set InpSendTestSignal=true only for a development/test API.");
      return INIT_SUCCEEDED;
     }

   if(StringFind(InpApiUrl,"https://")!=0 ||
      StringFind(InpApiUrl,"/api/v1/signals")<0 ||
      !IsSafeIdentifier(InpMasterId) ||
      !IsSafeIdentifier(InpRobotId) ||
      !IsSafeIdentifier(InpStrategyId) ||
      StringLen(InpMasterSecret)<1 ||
      !MathIsValidNumber(InpTestLot) || InpTestLot<=0 ||
      InpMagicNumber<0)
     {
      Print("Invalid configuration. Use HTTPS and valid IDs, secret, lot, and magic number.");
      return INIT_PARAMETERS_INCORRECT;
     }

   string symbol=(InpSymbol=="" ? _Symbol : InpSymbol);
   if(!IsSafeIdentifier(symbol))
     {
      Print("Invalid symbol. Allowed characters: letters, digits, dot, underscore, hyphen.");
      return INIT_PARAMETERS_INCORRECT;
     }

   double price=0.0;
   ENUM_SYMBOL_INFO_DOUBLE priceType=(InpBuy ? SYMBOL_ASK : SYMBOL_BID);
   if(!SymbolSelect(symbol,true) || !SymbolInfoDouble(symbol,priceType,price) || price<=0)
     {
      PrintFormat("Could not read a valid %s quote for %s.",(InpBuy ? "ASK" : "BID"),symbol);
      return INIT_FAILED;
     }
   int symbolDigits=(int)SymbolInfoInteger(symbol,SYMBOL_DIGITS);

   long timestamp=(long)TimeGMT()*1000;
   string nonce=StringFormat("%016I64X",GetTickCount64());
   string ticket=StringFormat("TEST-%I64d-%I64d",
                              (long)TimeLocal(),(long)GetTickCount64());
   string direction=(InpBuy ? "BUY" : "SELL");
   string body=StringFormat("{\"masterAccountId\":\"%s\",\"robotId\":\"%s\",\"strategyId\":\"%s\",\"magicNumber\":\"%I64d\",\"masterTicketId\":\"%s\",\"eventType\":\"OPEN\",\"eventSeq\":1,\"symbol\":\"%s\",\"direction\":\"%s\",\"masterLot\":%s,\"masterPrice\":%s}",
      InpMasterId,InpRobotId,InpStrategyId,InpMagicNumber,ticket,symbol,direction,
      DoubleToString(InpTestLot,8),
      DoubleToString(price,symbolDigits));

   string signingMessage=StringFormat("%I64d.%s.%s",timestamp,nonce,body);
   string signature="";
   if(!HmacSha256(InpMasterSecret,signingMessage,signature))
     {
      Print("Could not calculate the HMAC-SHA256 signature.");
      return INIT_FAILED;
     }

   char requestBody[];
   int bodyBytes=StringToCharArray(body,requestBody,0,WHOLE_ARRAY,CP_UTF8);
   if(bodyBytes<1)
     {
      Print("Could not encode the signal payload.");
      return INIT_FAILED;
     }
   ArrayResize(requestBody,bodyBytes-1);

   if(GlobalVariableSet(TEST_GUARD_NAME,(double)TimeLocal())==0)
     {
      Print("Could not set the one-shot test guard; signal not sent.");
      return INIT_FAILED;
     }

   string headers="Content-Type: application/json\r\n";
   headers+=StringFormat("x-master-id: %s\r\n",InpMasterId);
   headers+=StringFormat("x-signal-timestamp: %I64d\r\n",timestamp);
   headers+=StringFormat("x-signal-nonce: %s\r\n",nonce);
   headers+=StringFormat("x-signal-signature: %s\r\n",signature);
   char response[];
   string responseHeaders="";
   ResetLastError();
   int status=WebRequest("POST",InpApiUrl,headers,10000,
                         requestBody,response,responseHeaders);
   if(status==-1)
     {
      PrintFormat("WebRequest failed, error=%d. Allow the HTTPS host in MT5 Options > Expert Advisors.",
                  GetLastError());
      return INIT_FAILED;
     }

   string responseText=CharArrayToString(response,0,WHOLE_ARRAY,CP_UTF8);
   PrintFormat("Signal response: HTTP %d, %s",status,responseText);
   if(status==202 || status==200)
      PrintFormat("Signal accepted. Test ticket=%s. No trading order was submitted by this script.",ticket);
   return INIT_SUCCEEDED;
  }
