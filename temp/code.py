import json
import os
x = 24
print("Once again thanks")

print("x is now "+str(x)+", so I think it worked")

print("Also multi-line statements like if statements and while/for loops shoudl work now, so let's test that")

print("I'll print if x is equal to 24")

if x == 24:

  print("Yes, x is equal to 24")

else:

  print("No, x is not equal to 24")
dout = {}
dout['x'] = x
with open(os.path.dirname(os.path.abspath(__file__))+'/out.json', 'w') as f:
	json.dump(dout, f)
	f.close()