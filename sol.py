import os
from selenium import webdriver
from selenium.webdriver.common.by import By

driver = webdriver.Chrome()
driver.get("file://" + os.path.abspath("index.html"))

divs = driver.find_elements(By.CLASS_NAME, "item")
for d in divs:
    t = d.get_attribute("textContent")
    if "HackSir" in t:
        print(t)
# HackSir{YOUGOTHEFLAG}